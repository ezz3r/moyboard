import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { api, isTauri, onLibraryChanged, onPlayback } from "../api";
import { SoundTile } from "./SoundTile";
import type { CategoryMeta, Playing, SoundEntry } from "../types";
import { countsOf } from "../playback";
import { resolveColor } from "../colorTokens";
import { GripVertical, Layers, Square, X } from "lucide-react";

const ALL = "all";
const NONE = "uncategorized";

type Filter = { key: string; label: string; color: string | null; count: number };

/**
 * The Quick Panel window: a grid of tiles, with a narrow rail on the right for the category
 * filter, moving the window, Stop and Hide. Left click plays on the main output, right click
 * previews on the headphones. Up/Down move between tiles, Enter plays, Esc hides.
 */
export function QuickPanel() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [playing, setPlaying] = useState<Playing[]>([]);
  const [filter, setFilter] = useState(ALL);
  const [error, setError] = useState<string | null>(null);
  const [tileMin, setTileMin] = useState(56);
  const [tileH, setTileH] = useState(56);
  const [catOpen, setCatOpen] = useState(false);
  const rail = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);

  // Hold mode keeps the hotkey down while scrolling. With Ctrl or Alt held the wheel zooms or does
  // nothing, so the board scrolls itself. The listener is not passive, so the zoom can be stopped.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey && !e.shiftKey) return;
      e.preventDefault();
      el.scrollTop += e.deltaY || e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
      if (e.key === "Escape") {
        if (catOpen) return void setCatOpen(false);
        return void hide();
      }
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
  }, [catOpen]);

  // The category list closes on a click anywhere outside the rail.
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rail.current?.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [catOpen]);

  // Rail entries: All, then the named categories; counts as in the main window.
  const filters: Filter[] = useMemo(() => {
    const ids = new Set<string>(Object.keys(categories));
    for (const s of sounds) if (s.meta.category) ids.add(s.meta.category);
    const named = [...ids]
      .map((id) => ({ id, name: categories[id]?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const count = (key: string) =>
      key === ALL
        ? sounds.length
        : key === NONE
          ? sounds.filter((s) => !s.meta.category).length
          : sounds.filter((s) => s.meta.category === key).length;
    return [
      { key: ALL, label: "All", color: null, count: count(ALL) },
      ...named.map((c) => ({ key: c.id, label: c.name, color: categories[c.id]?.color ?? null, count: count(c.id) })),
    ];
  }, [sounds, categories]);

  const visible = useMemo(
    () =>
      sounds.filter((s) =>
        filter === ALL ? true : filter === NONE ? !s.meta.category : s.meta.category === filter,
      ),
    [sounds, filter],
  );

  const act = (run: () => Promise<void>) => void run().catch((e) => setError(String(e)));

  return (
    <div className="quick" style={{ "--tile-min": `${tileMin}px`, "--tile-h": `${tileH}px` } as CSSProperties}>
      <div className="quick-body" ref={body}>
        {error && (
          <p className="quick-error" role="alert">
            {error}
          </p>
        )}
        {visible.length === 0 ? (
          <p className="empty">{sounds.length === 0 ? "No sounds yet. Add sounds in the main window." : "No sounds in this category."}</p>
        ) : (
          <div className="quick-grid">
            {visible.map((s) => (
              <SoundTile
                key={s.fileName}
                entry={s}
                accent={resolveColor(s.meta, categories)}
                counts={countsOf(playing, s.fileName)}
                onPlay={() => act(() => api.playSound(s.fileName))}
                onPreview={() => act(() => api.previewSound(s.fileName))}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="quick-rail" aria-label="Quick Panel controls" ref={rail}>
        <div className="quick-rail-row">
          <button
            type="button"
            className="quick-ico"
            aria-label="Move panel"
            title="Drag to move"
            onPointerDown={(e) => {
              if (e.button === 0 && isTauri) void getCurrentWebviewWindow().startDragging();
            }}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="quick-ico"
            aria-label="Stop all sounds"
            title="Stop all sounds (main and preview)"
            onClick={() => act(() => api.stopAll())}
          >
            <Square size={12} fill="currentColor" aria-hidden="true" />
          </button>
          <button type="button" className="quick-ico" aria-label="Hide Quick Panel" title="Hide (Esc)" onClick={() => void hide()}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="quick-cat-wrap">
          <button
            type="button"
            className="quick-ico quick-ico-cat"
            aria-label={`Category: ${(filters.find((f) => f.key === filter) ?? filters[0]).label}`}
            aria-haspopup="listbox"
            aria-expanded={catOpen}
            title="Choose category"
            onClick={() => setCatOpen((o) => !o)}
          >
            <Layers size={14} aria-hidden="true" />
          </button>
          {catOpen && (
            <div className="quick-cat-pop" role="listbox" aria-label="Categories">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="option"
                  aria-selected={filter === f.key}
                  className="quick-cat"
                  style={f.color ? ({ "--cat": f.color } as CSSProperties) : undefined}
                  onClick={() => {
                    setFilter(f.key);
                    setCatOpen(false);
                  }}
                >
                  {f.color && <span className="quick-cat-dot" aria-hidden="true" />}
                  <span className="quick-cat-name">{f.label}</span>
                  <span className="quick-cat-count">{f.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

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
