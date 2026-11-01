import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api, onFileDrop, onLibraryChanged, onPlayback } from "./api";
import { CategoryMenu, type CategoryOption } from "./components/CategoryMenu";
import { CategoryPanel } from "./components/CategoryPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Pad } from "./components/Pad";
import { SIDEBAR_DEFAULT, SidebarHandle } from "./components/SidebarHandle";
import { SoundPanel } from "./components/SoundPanel";
import { Settings as SettingsView } from "./components/Settings";
import { emptyMeta, type CategoryMeta, type OutputState, type Playing, type SoundEntry, type TileSizes } from "./types";
import { stemOf } from "./names";
import { ChevronDown, RefreshCw, Search, Settings, Square, X } from "lucide-react";

const ALL = "all";
const NONE = "uncategorized";

type Selection = { type: "sound" | "category"; id: string } | null;

export default function App() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [libraryDir, setLibraryDir] = useState("");
  const [output, setOutput] = useState<OutputState>({
    devices: [],
    selected: null,
    monitorActive: false,
    monitorVolume: 1,
    previewSelected: null,
  });
  const [master, setMaster] = useState(1);
  const [view, setView] = useState<"pads" | "settings">("pads");
  const [filter, setFilter] = useState(ALL);
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState<Playing[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error"; settings?: boolean } | null>(null);
  const [sideWidth, setSideWidth] = useState(SIDEBAR_DEFAULT);
  const [tileSizes, setTileSizes] = useState<TileSizes>({ pad: 128, padHeight: 128, quick: 56, quickHeight: 56 });

  // Same-device errors get an "Open Settings" action; the message text is the marker.
  const notify = useCallback(
    (text: string) => setToast({ text, tone: "error", settings: text.startsWith("Preview and main output") }),
    [],
  );
  const say = useCallback((text: string) => setToast({ text, tone: "info" }), []);

  const refresh = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([api.rescan(), api.listCategories()]);
      setSounds(list);
      setCategories(cats);
    } catch (e) {
      notify(String(e));
    }
  }, [notify]);

  useEffect(() => {
    void (async () => {
      try {
        setLibraryDir(await api.getLibraryDir());
        setOutput(await api.listOutputDevices());
        setSideWidth(await api.getSidebarWidth());
        setTileSizes(await api.getTileSizes());
      } catch (e) {
        notify(String(e));
      }
      await refresh();
    })();
  }, [notify, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const nameOf = (id: string) => categories[id]?.name ?? id;

  // Every category: the saved ones, plus any id that only appears on sounds (older files stored names).
  const catList = useMemo(() => {
    const ids = new Set<string>(Object.keys(categories));
    for (const s of sounds) if (s.meta.category) ids.add(s.meta.category);
    return [...ids]
      .map((id) => ({ id, name: categories[id]?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sounds, categories]);

  // Search matches the sound's name, or its category's name (then the whole category shows).
  const needle = term.trim().toLowerCase();
  const matches = (s: SoundEntry) =>
    !needle ||
    stemOf(s.fileName).toLowerCase().includes(needle) ||
    (!!s.meta.category && nameOf(s.meta.category).toLowerCase().includes(needle));

  const visible = useMemo(() => {
    const base =
      filter === ALL
        ? sounds
        : filter === NONE
          ? sounds.filter((s) => !s.meta.category)
          : sounds.filter((s) => s.meta.category === filter);
    return base.filter(matches);
  }, [sounds, filter, needle, categories]);

  // The All view: one section per category, then Uncategorized (only if it has sounds).
  // While searching, sections with no hits are hidden.
  const groups = useMemo(
    () =>
      [
        ...catList.map((c) => ({
          key: c.id,
          name: c.name,
          color: categories[c.id]?.color ?? null,
          selectable: true,
          entries: sounds.filter((s) => s.meta.category === c.id && matches(s)),
        })),
        {
          key: NONE,
          name: "Uncategorized",
          color: null,
          selectable: false,
          entries: sounds.filter((s) => !s.meta.category && matches(s)),
        },
      ].filter((g) => (needle ? g.entries.length > 0 : g.selectable || g.entries.length > 0)),
    [catList, categories, sounds, needle],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setTerm(query), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  // Ctrl+F focuses search. Delete removes the selected sound, unless a text field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if (e.key === "Delete" && !typing && selection?.type === "sound" && !pendingDelete) {
        e.preventDefault();
        setPendingDelete(selection.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, pendingDelete]);

  const countFor = (key: string) =>
    key === ALL
      ? sounds.length
      : key === NONE
        ? sounds.filter((s) => !s.meta.category).length
        : sounds.filter((s) => s.meta.category === key).length;

  const categoryOptions: CategoryOption[] = [
    { key: ALL, label: "All", color: null, count: sounds.length },
    { key: NONE, label: "Uncategorized", color: null, count: countFor(NONE) },
    ...catList.map((c) => ({
      key: c.id,
      label: c.name,
      color: categories[c.id]?.color ?? null,
      count: countFor(c.id),
    })),
  ];

  function editFilter() {
    if (filter === ALL || filter === NONE) return;
    setView("pads");
    setSelection({ type: "category", id: filter });
  }

  async function addCategory() {
    const taken = new Set(catList.map((c) => c.name.toLowerCase()));
    let name = "New category";
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New category ${n}`;
    try {
      const id = await api.newCategory(name);
      await refresh();
      setFilter(id);
      setView("pads");
      setSelection({ type: "category", id });
    } catch (e) {
      notify(String(e));
    }
  }

  // Dropped files are copied in. If a category is selected, they join it.
  const importPaths = useCallback(
    async (paths: string[]) => {
      try {
        const report = await api.importFiles(paths);
        if (filter !== ALL && filter !== NONE) {
          for (const name of report.imported) {
            await api.setSoundMeta(name, { ...emptyMeta, category: filter });
          }
        }
        if (report.errors.length) notify(report.errors.join(" "));
      } catch (e) {
        notify(String(e));
      }
      await refresh();
    },
    [filter, notify, refresh],
  );

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void onLibraryChanged(() => void refresh()).then((off) => {
      if (alive) unlisten = off;
      else off();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void onFileDrop((ev) => {
      if (ev.type === "enter") setDragging(true);
      else if (ev.type === "leave") setDragging(false);
      else if (ev.type === "drop") {
        setDragging(false);
        void importPaths(ev.paths);
      }
    }).then((off) => {
      if (alive) unsubscribe = off;
      else off();
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [importPaths]);

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void onPlayback(setPlaying).then((off) => {
      if (alive) unsubscribe = off;
      else off();
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  /** Runs a playback command. The list of sounding voices arrives by event, so no state is set here. */
  function act(run: () => Promise<void>) {
    void run().catch((e) => notify(String(e)));
  }

  async function deleteSound(fileName: string) {
    setPendingDelete(null);
    try {
      await api.deleteSound(fileName);
      if (selection?.type === "sound" && selection.id === fileName) setSelection(null);
      say(`Moved ${stemOf(fileName)} to the Recycle Bin.`);
      await refresh();
    } catch (e) {
      notify(String(e));
    }
  }

  async function forget(fileName: string) {
    try {
      await api.forgetSound(fileName);
      await refresh();
    } catch (e) {
      notify(String(e));
    }
  }

  const selectedSound =
    selection?.type === "sound" ? (sounds.find((s) => s.fileName === selection.id) ?? null) : null;
  const selectedCategory = selection?.type === "category" ? selection.id : null;

  const renderPad = (s: SoundEntry) => (
    <Pad
      key={s.fileName}
      entry={s}
      accent={s.meta.color ?? (s.meta.category ? (categories[s.meta.category]?.color ?? null) : null)}
      selected={selection?.type === "sound" && selection.id === s.fileName}
      instances={playing.filter((p) => p.fileName === s.fileName && !p.previewing).length}
      previewing={playing.some((p) => p.fileName === s.fileName && p.previewing)}
      onSelect={() => setSelection({ type: "sound", id: s.fileName })}
      onPlay={() => act(() => api.playSound(s.fileName))}
      onStop={() => act(() => api.stopSound(s.fileName, false))}
      onPreview={() => act(() => api.previewSound(s.fileName))}
      onStopPreview={() => act(() => api.stopSound(s.fileName, true))}
      onForget={() => void forget(s.fileName)}
    />
  );

  return (
    <div className="app" style={{ "--pad-min": `${tileSizes.pad}px`, "--pad-h": `${tileSizes.padHeight}px` } as CSSProperties}>
      <div className="body" style={{ "--side-w": `${sideWidth}px` } as CSSProperties}>
        <div className="stage">
        <header className="top">
        <CategoryMenu
          value={filter}
          options={categoryOptions}
          onChange={(key) => {
            setFilter(key);
            setView("pads");
          }}
          onNew={() => void addCategory()}
          onEdit={editFilter}
          editable={filter !== ALL && filter !== NONE}
        />

        <div className="top-search" role="search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search"
            aria-label="Search sounds and categories"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="top-actions">
          <IconButton label="Rescan" onClick={() => void refresh()}>
            <RefreshCw size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={view === "settings" ? "Back to pads" : "Settings"}
            pressed={view === "settings"}
            onClick={() => setView(view === "settings" ? "pads" : "settings")}
          >
            <Settings size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            label="Stop all"
            onClick={() => void api.stopAll().catch((err) => notify(String(err)))}
          >
            <Square size={18} fill="currentColor" aria-hidden="true" />
          </IconButton>
        </div>
      </header>

        <main className="main">
          {view === "settings" ? (
            <SettingsView
              libraryDir={libraryDir}
              output={output}
              onLibraryChanged={setLibraryDir}
              onOutputChanged={(patch) => setOutput((o) => ({ ...o, ...patch }))}
              onRefresh={() => void refresh()}
              onError={notify}
              tileSizes={tileSizes}
              onTileSizeChanged={(kind, size) => {
                setTileSizes((t) => ({ ...t, [kind]: size }));
                void api.setTileSize(kind, size).catch((e) => notify(String(e)));
              }}
            />
          ) : needle && (filter === ALL ? !sounds.some(matches) : visible.length === 0) ? (
            <p className="empty">No sounds found.</p>
          ) : filter === ALL ? (
            sounds.length === 0 ? (
              <Empty filter={filter} name="" />
            ) : (
              <div className="groups">
                {groups.map((g) => {
                  const isCollapsed = collapsed.has(g.key);
                  return (
                    <Group
                      key={g.key}
                      name={g.name}
                      color={g.color}
                      count={g.entries.length}
                      collapsed={isCollapsed}
                      onToggle={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      onSelect={g.selectable ? () => setSelection({ type: "category", id: g.key }) : undefined}
                    >
                      {!isCollapsed &&
                        (g.entries.length > 0 ? (
                          <div className="pads">{g.entries.map(renderPad)}</div>
                        ) : (
                          <p className="group-empty">No sounds yet. Set this category on a sound.</p>
                        ))}
                    </Group>
                  );
                })}
              </div>
            )
          ) : visible.length === 0 ? (
            <Empty filter={filter} name={filter === NONE ? "" : nameOf(filter)} />
          ) : (
            <div className="pads">{visible.map(renderPad)}</div>
          )}
        </main>

        <footer className="bottom-bar">
          <label className="top-field device">
            <span>Play to</span>
            <select
              aria-label="Output device"
              value={output.selected ?? ""}
              onChange={async (e) => {
                const name = e.target.value || null;
                try {
                  await api.setOutputDevice(name);
                  setOutput((o) => ({ ...o, selected: name }));
                } catch (err) {
                  notify(String(err));
                }
              }}
            >
              <option value="">System default output</option>
              {output.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="top-field volume">
            <span>Others</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={master}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMaster(v);
                void api.setMasterVolume(v).catch((err) => notify(String(err)));
              }}
              aria-label="Volume for others (main output)"
              aria-valuetext={`${Math.round(master * 100)} percent`}
            />
            <output className="value">{Math.round(master * 100)} %</output>
          </label>

          <label className="top-field volume" title={output.monitorActive ? "Your volume: sounds you hear on the Windows default output" : "Off: the Windows default output is the main output"}>
            <span>You</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={output.monitorVolume}
              disabled={!output.monitorActive}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOutput((o) => ({ ...o, monitorVolume: v }));
                void api.setMonitorVolume(v).catch((err) => notify(String(err)));
              }}
              aria-label="Volume for you (monitor output)"
              aria-valuetext={`${Math.round(output.monitorVolume * 100)} percent`}
            />
            <output className="value">{Math.round(output.monitorVolume * 100)} %</output>
          </label>
        </footer>
        </div>

        <SidebarHandle
          width={sideWidth}
          onChange={setSideWidth}
          onCommit={(w) => api.setSidebarWidth(w).catch((e) => notify(String(e)))}
        />

        <aside className="sidebar" aria-label="Selected item">
          {selectedSound ? (
            <SoundPanel
              key={selectedSound.fileName}
              entry={selectedSound}
              sounds={sounds}
              categories={catList}
              onChanged={() => void refresh()}
              onRenamed={(name) => {
                setSelection({ type: "sound", id: name });
                void refresh();
              }}
              onExported={(newName) => {
                say(`Saved as ${newName}`);
                void refresh();
              }}
              onDelete={() => setPendingDelete(selectedSound.fileName)}
              onError={notify}
            />
          ) : selectedCategory !== null ? (
            <CategoryPanel
              key={selectedCategory}
              id={selectedCategory}
              category={categories[selectedCategory]}
              count={countFor(selectedCategory)}
              onChanged={() => void refresh()}
              onDeleted={() => {
                setSelection(null);
                if (filter === selectedCategory) setFilter(ALL);
                void refresh();
              }}
              onError={notify}
            />
          ) : (
            <p className="side-empty">Select a sound or a category to edit it.</p>
          )}
        </aside>
      </div>

      {dragging && (
        <div className="drop" aria-hidden="true">
          <p>Drop to copy into moyboard</p>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${stemOf(pendingDelete)}?`}
          body="The file moves to the Recycle Bin. Its icon, category, colour, hotkey and trim are removed."
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void deleteSound(pendingDelete)}
        />
      )}

      {toast && (
        <div
          className={`toast toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
          onClick={() => setToast(null)}
        >
          {toast.text}
          {toast.settings && (
            <button
              type="button"
              className="toast-action"
              onClick={(e) => {
                e.stopPropagation();
                setView("settings");
                setToast(null);
              }}
            >
              Open Settings
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ filter, name }: { filter: string; name: string }) {
  const text =
    filter === ALL
      ? "No sounds yet. Drop audio files here to copy them in."
      : filter === NONE
        ? "Every sound has a category."
        : `Nothing in ${name} yet. Set this category on a sound to see it here.`;
  return <p className="empty">{text}</p>;
}

/** A category section in the All view. The title selects the category; the chevron folds it. */
function Group({
  name,
  color,
  count,
  collapsed,
  onToggle,
  onSelect,
  children,
}: {
  name: string;
  color: string | null;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const style = color ? ({ "--cat": color } as CSSProperties) : undefined;
  return (
    <section className="group" style={style}>
      <header className="group-head">
        <button
          type="button"
          className="group-toggle"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${name}`}
          onClick={onToggle}
        >
          <ChevronDown size={16} aria-hidden="true" className={collapsed ? "is-folded" : undefined} />
        </button>
        {onSelect ? (
          <button type="button" className="group-title" onClick={onSelect} title="Edit category">
            <span className="swatch-dot" aria-hidden="true" />
            {name}
          </button>
        ) : (
          <span className="group-title">{name}</span>
        )}
        <span className="count">{count}</span>
      </header>
      {children}
    </section>
  );
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
  tone,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      className={`btn-icon${tone === "danger" ? " is-danger" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
