import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onFileDrop, onLibraryChanged } from "./api";
import { SoundPanel } from "./components/SoundPanel";
import { Pad } from "./components/Pad";
import { Settings as SettingsView } from "./components/Settings";
import { emptyMeta, type OutputState, type SoundEntry } from "./types";
import { RefreshCw, Settings, Square } from "lucide-react";

const ALL = "all";
const NONE = "uncategorized";

type Selection = { type: "sound" | "category"; id: string } | null;

export default function App() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [libraryDir, setLibraryDir] = useState("");
  const [output, setOutput] = useState<OutputState>({
    devices: [],
    selected: null,
    monitorSelected: null,
    monitorVolume: 1,
  });
  const [master, setMaster] = useState(1);
  const [view, setView] = useState<"pads" | "settings">("pads");
  const [filter, setFilter] = useState(ALL);
  const [selection, setSelection] = useState<Selection>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);

  const notify = useCallback((text: string) => setToast({ text, tone: "error" }), []);
  const say = useCallback((text: string) => setToast({ text, tone: "info" }), []);

  const refresh = useCallback(async () => {
    try {
      setSounds(await api.rescan());
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

  const categories = useMemo(
    () => [...new Set(sounds.map((s) => s.meta.category).filter((c): c is string => !!c))].sort(),
    [sounds],
  );

  const visible = useMemo(() => {
    if (filter === ALL) return sounds;
    if (filter === NONE) return sounds.filter((s) => !s.meta.category);
    return sounds.filter((s) => s.meta.category === filter);
  }, [sounds, filter]);

  const countFor = (key: string) =>
    key === ALL
      ? sounds.length
      : key === NONE
        ? sounds.filter((s) => !s.meta.category).length
        : sounds.filter((s) => s.meta.category === key).length;

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

  async function play(fileName: string) {
    setPlaying(fileName);
    window.setTimeout(() => setPlaying((p) => (p === fileName ? null : p)), 350);
    try {
      await api.playSound(fileName);
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
            ...categories.map((c) => ({ key: c, label: c })),
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="rail-item"
              aria-current={view === "pads" && filter === item.key ? "true" : undefined}
              onClick={() => {
                setFilter(item.key);
                setView("pads");
              }}
            >
              <span>{item.label}</span>
              <span className="count">{countFor(item.key)}</span>
            </button>
          ))}
        </nav>

        <main className="main">
          {view === "settings" ? (
            <SettingsView
              libraryDir={libraryDir}
              output={output}
              categories={categories}
              sounds={sounds}
              onLibraryChanged={setLibraryDir}
              onOutputChanged={(patch) => setOutput((o) => ({ ...o, ...patch }))}
              onCategoriesChanged={() => void refresh()}
              onError={notify}
            />
          ) : visible.length === 0 ? (
            <Empty filter={filter} />
          ) : (
            <div className="pads">
              {visible.map((s) => (
                <Pad
                  key={s.fileName}
                  entry={s}
                  playing={playing === s.fileName}
                  onPlay={() => void play(s.fileName)}
                  onEdit={() => setSelection({ type: "sound", id: s.fileName })}
                  onForget={() => void forget(s.fileName)}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="sidebar" aria-label="Selected item">
          {selectedSound ? (
            <SoundPanel
              key={selectedSound.fileName}
              entry={selectedSound}
              sounds={sounds}
              categories={categories}
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
          ) : (
            <p className="side-empty">Select a sound to edit it.</p>
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

function Empty({ filter }: { filter: string }) {
  const text =
    filter === ALL
      ? "No sounds yet. Drop audio files here to copy them in."
      : filter === NONE
        ? "Every sound has a category."
        : `Nothing in ${filter} yet. Set this category on a sound to see it here.`;
  return <p className="empty">{text}</p>;
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
