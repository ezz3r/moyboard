import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { api, onFileDrop, onLibraryChanged, onPlayback } from "./api";
import { CategoryPanel } from "./components/CategoryPanel";
import { Pad } from "./components/Pad";
import { SoundPanel } from "./components/SoundPanel";
import { Settings as SettingsView } from "./components/Settings";
import { emptyMeta, type CategoryMeta, type OutputState, type Playing, type SoundEntry } from "./types";
import { ChevronDown, Plus, RefreshCw, Settings, Square } from "lucide-react";

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
    monitorSelected: null,
    monitorVolume: 1,
    previewSelected: null,
  });
  const [master, setMaster] = useState(1);
  const [view, setView] = useState<"pads" | "settings">("pads");
  const [filter, setFilter] = useState(ALL);
  const [selection, setSelection] = useState<Selection>(null);
  const [playing, setPlaying] = useState<Playing[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);

  const notify = useCallback((text: string) => setToast({ text, tone: "error" }), []);
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

  const visible = useMemo(() => {
    if (filter === ALL) return sounds;
    if (filter === NONE) return sounds.filter((s) => !s.meta.category);
    return sounds.filter((s) => s.meta.category === filter);
  }, [sounds, filter]);

  // The All view: one section per category, then Uncategorized (only if it has sounds).
  const groups = useMemo(
    () => [
      ...catList.map((c) => ({
        key: c.id,
        name: c.name,
        color: categories[c.id]?.color ?? null,
        selectable: true,
        entries: sounds.filter((s) => s.meta.category === c.id),
      })),
      {
        key: NONE,
        name: "Uncategorized",
        color: null,
        selectable: false,
        entries: sounds.filter((s) => !s.meta.category),
      },
    ].filter((g) => g.selectable || g.entries.length > 0),
    [catList, categories, sounds],
  );

  const countFor = (key: string) =>
    key === ALL
      ? sounds.length
      : key === NONE
        ? sounds.filter((s) => !s.meta.category).length
        : sounds.filter((s) => s.meta.category === key).length;

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
      playing={playing.some((p) => p.fileName === s.fileName && !p.previewing)}
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
    <div className="app">
      <header className="top">
        <span className="brand">moyboard</span>

        <label className="top-field device">
          <span className="sr-only">Output device</span>
          <select
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
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="top-field volume">
          <span>Master</span>
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
            aria-valuetext={`${Math.round(master * 100)} percent`}
          />
        </label>

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
            tone="danger"
            onClick={() => void api.stopAll().catch((err) => notify(String(err)))}
          >
            <Square size={16} fill="currentColor" aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div className="body">
        <nav className="rail" aria-label="Categories">
          {[
            { key: ALL, label: "All" },
            { key: NONE, label: "Uncategorized" },
            ...catList.map((c) => ({ key: c.id, label: c.name })),
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="rail-item"
              aria-current={view === "pads" && filter === item.key ? "true" : undefined}
              onClick={() => {
                setFilter(item.key);
                setView("pads");
                if (item.key !== ALL && item.key !== NONE) setSelection({ type: "category", id: item.key });
              }}
            >
              <span>{item.label}</span>
              <span className="count">{countFor(item.key)}</span>
            </button>
          ))}
          <button type="button" className="rail-add" onClick={() => void addCategory()}>
            <Plus size={14} aria-hidden="true" />
            New category
          </button>
        </nav>

        <main className="main">
          {view === "settings" ? (
            <SettingsView
              libraryDir={libraryDir}
              output={output}
              onLibraryChanged={setLibraryDir}
              onOutputChanged={(patch) => setOutput((o) => ({ ...o, ...patch }))}
              onRefresh={() => void refresh()}
              onError={notify}
            />
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

      {toast && (
        <div
          className={`toast toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
          onClick={() => setToast(null)}
        >
          {toast.text}
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
  const style = color ? ({ "--accent": color } as CSSProperties) : undefined;
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
