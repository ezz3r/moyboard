import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { api, isTauri, onLibraryChanged, onPlayback } from "../api";
import { stemOf } from "../names";
import { SoundTile } from "./SoundTile";
import type { CategoryMeta, Playing, SoundEntry } from "../types";
import { GripVertical, Search, Square, X } from "lucide-react";

/**
 * The Quick Panel window: one flat grid of sounds and a search field. Left click plays on the
 * main output, right click previews on the headphones. Up/Down move between tiles, Enter plays,
 * Esc hides. No categories and no editing; those stay in the main window.
 */
export function QuickPanel() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [playing, setPlaying] = useState<Playing[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tileMin, setTileMin] = useState(56);
  const [tileH, setTileH] = useState(56);

  const refresh = useCallback(async () => {
    try {
      const [list, cats, sizes] = await Promise.all([api.rescan(), api.listCategories(), api.getTileSizes()]);
      setSounds(list);
      setCategories(cats);
      setTileMin(sizes.quick);
      setTileH(sizes.quickHeight);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let alive = true;
    let offLibrary: (() => void) | undefined;
    let offPlayback: (() => void) | undefined;
    void onLibraryChanged(() => void refresh()).then((off) => (alive ? (offLibrary = off) : off()));
    void onPlayback(setPlaying).then((off) => (alive ? (offPlayback = off) : off()));
    return () => {
      alive = false;
      offLibrary?.();
      offPlayback?.();
    };
  }, [refresh]);

  // Position and size are saved once a user move or resize has settled. The backend announces
  // its own restore ("quick-panel-restored"); the moves that follow are echoes and are not saved.
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWebviewWindow();
    let timer: number | undefined;
    let echoUntil = 0;
    let alive = true;
    const offs: Array<() => void> = [];
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (Date.now() < echoUntil) return;
        try {
          if (!(await win.isVisible())) return;
          const pos = await win.outerPosition();
          const size = await win.innerSize();
          await api.saveQuickPanelGeometry(pos.x, pos.y, size.width, size.height);
        } catch (e) {
          setError(String(e));
        }
      }, 400);
    };
    const pendings: Promise<() => void>[] = [
      win.onMoved(save),
      win.onResized(save),
      win.listen("quick-panel-restored", () => {
        echoUntil = Date.now() + 1200;
      }),
    ];
    for (const pending of pendings) {
      void pending.then((off) => (alive ? offs.push(off) : off()));
    }
    return () => {
      alive = false;
      window.clearTimeout(timer);
      offs.forEach((off) => off());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return void hide();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const rows = [...document.querySelectorAll<HTMLButtonElement>(".quick .tile-play:not(:disabled)")];
      if (rows.length === 0) return;
      e.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        at === -1 ? (e.key === "ArrowDown" ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)));
      rows[next].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => sounds.filter((s) => !needle || stemOf(s.fileName).toLowerCase().includes(needle)),
    [sounds, needle],
  );

  const act = (run: () => Promise<void>) => void run().catch((e) => setError(String(e)));

  return (
    <div className="quick" style={{ "--tile-min": `${tileMin}px`, "--tile-h": `${tileH}px` } as CSSProperties}>
      <header className="quick-head">
        <button
          type="button"
          className="quick-grip"
          aria-label="Move panel"
          title="Drag to move"
          onPointerDown={(e) => {
            if (e.button === 0 && isTauri) void getCurrentWebviewWindow().startDragging();
          }}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        <div className="quick-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search"
            aria-label="Search sounds"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="Stop all sounds"
          title="Stop all sounds"
          onClick={() => act(() => api.stopAll())}
        >
          <Square size={14} fill="currentColor" aria-hidden="true" />
        </button>
        <button type="button" className="btn-icon" aria-label="Hide Quick Panel" title="Hide (Esc)" onClick={() => void hide()}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <p className="quick-error" role="alert">
          {error}
        </p>
      )}

      <div className="quick-body">
        {visible.length === 0 ? (
          <p className="empty">{sounds.length === 0 ? "No sounds yet. Add sounds in the main window." : "No sounds found."}</p>
        ) : (
          <div className="quick-grid">
            {visible.map((s) => (
              <SoundTile
                key={s.fileName}
                entry={s}
                accent={s.meta.color ?? (s.meta.category ? (categories[s.meta.category]?.color ?? null) : null)}
                instances={playing.filter((p) => p.fileName === s.fileName && !p.previewing).length}
                previewing={playing.some((p) => p.fileName === s.fileName && p.previewing)}
                onPlay={() => act(() => api.playSound(s.fileName))}
                onPreview={() => act(() => api.previewSound(s.fileName))}
              />
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="quick-resize"
        aria-label="Resize panel"
        title="Drag to resize"
        onPointerDown={(e) => {
          if (e.button === 0 && isTauri) void getCurrentWebviewWindow().startResizeDragging("SouthEast");
        }}
      />
    </div>
  );
}

async function hide() {
  if (isTauri) await api.hideQuickPanel();
}
