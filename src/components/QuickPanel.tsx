import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { api, isTauri, onLibraryChanged, onPlayback } from "../api";
import { stemOf } from "../names";
import { CategoryMenu, type CategoryOption } from "./CategoryMenu";
import { SoundTile } from "./SoundTile";
import type { CategoryMeta, Playing, SoundEntry } from "../types";
import { ChevronDown, Search, Square, X } from "lucide-react";

const ALL = "all";
const NONE = "uncategorized";

/**
 * The Quick Panel window: a dense grid of sounds grouped by category. Left click plays on the
 * main output, right click previews on the headphones. No sidebar and no editing.
 * Up/Down move between tiles, Enter plays, Esc hides.
 */
export function QuickPanel() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [playing, setPlaying] = useState<Playing[]>([]);
  const [filter, setFilter] = useState(ALL);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
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

  // Position and size are saved once a move or resize has settled, so the next show restores them.
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWebviewWindow();
    let timer: number | undefined;
    let alive = true;
    const offs: Array<() => void> = [];
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        try {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          await api.saveQuickPanelGeometry(pos.x, pos.y, size.width, size.height);
        } catch (e) {
          setError(String(e));
        }
      }, 400);
    };
    for (const pending of [win.onMoved(save), win.onResized(save)]) {
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
      // Up/Down walk the tiles in reading order; folded groups are not rendered, so they are skipped.
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

  const options: CategoryOption[] = useMemo(() => {
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
      { key: NONE, label: "Uncategorized", color: null, count: count(NONE) },
      ...named.map((c) => ({ key: c.id, label: c.name, color: categories[c.id]?.color ?? null, count: count(c.id) })),
    ];
  }, [sounds, categories]);

  const needle = query.trim().toLowerCase();
  const visible = sounds.filter((s) => {
    const inCategory =
      filter === ALL ? true : filter === NONE ? !s.meta.category : s.meta.category === filter;
    const hit =
      !needle ||
      stemOf(s.fileName).toLowerCase().includes(needle) ||
      (!!s.meta.category && (categories[s.meta.category]?.name ?? "").toLowerCase().includes(needle));
    return inCategory && hit;
  });

  // Sections in the order of the category menu: named categories, then Uncategorized last.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; color: string | null; entries: SoundEntry[] }>();
    for (const s of visible) {
      const key = s.meta.category ?? NONE;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          name: key === NONE ? "Uncategorized" : (categories[key]?.name ?? key),
          color: key === NONE ? null : (categories[key]?.color ?? null),
          entries: [],
        };
        map.set(key, g);
      }
      g.entries.push(s);
    }
    return [...map.values()].sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : a.name.localeCompare(b.name)));
  }, [visible, categories]);

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
          <span aria-hidden="true">⠿</span>
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
          title="Stop all sounds (main and preview)"
          onClick={() => act(() => api.stopAll())}
        >
          <Square size={16} fill="currentColor" aria-hidden="true" />
        </button>
        <CategoryMenu value={filter} options={options} onChange={setFilter} />
        <button type="button" className="btn-icon" aria-label="Hide Quick Panel" title="Hide (Esc)" onClick={() => void hide()}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <p className="quick-hint">Left click: play · Right click: preview</p>

      {error && (
        <p className="quick-error" role="alert">
          {error}
        </p>
      )}

      <div className="quick-body">
        {visible.length === 0 ? (
          <p className="empty">{sounds.length === 0 ? "No sounds yet. Add sounds in the main window." : "No sounds found."}</p>
        ) : (
          groups.map((g) => {
            const isFolded = folded.has(g.key);
            return (
              <section key={g.key} className="quick-group">
                <button
                  type="button"
                  className="quick-group-head"
                  aria-expanded={!isFolded}
                  onClick={() =>
                    setFolded((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key);
                      else next.add(g.key);
                      return next;
                    })
                  }
                >
                  <ChevronDown size={14} aria-hidden="true" className={isFolded ? "is-folded" : undefined} />
                  {g.color && <span className="quick-group-dot" style={{ background: g.color }} aria-hidden="true" />}
                  <span className="quick-group-name">{g.name}</span>
                  <span className="quick-group-count">{g.entries.length}</span>
                </button>
                {!isFolded && (
                  <div className="quick-grid">
                    {g.entries.map((s) => (
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
              </section>
            );
          })
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
