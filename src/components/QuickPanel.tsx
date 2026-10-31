import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { api, isTauri, onLibraryChanged, onPlayback } from "../api";
import { stemOf } from "../names";
import { CategoryMenu, type CategoryOption } from "./CategoryMenu";
import { Pad } from "./Pad";
import type { CategoryMeta, Playing, SoundEntry } from "../types";
import { Search, X } from "lucide-react";

const ALL = "all";
const NONE = "uncategorized";
const noop = () => {};

/**
 * The Quick Panel window: a small board of sounds with the same pads as the main window.
 * It has no sidebar and no editing. Esc hides it.
 */
export function QuickPanel() {
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryMeta>>({});
  const [playing, setPlaying] = useState<Playing[]>([]);
  const [filter, setFilter] = useState(ALL);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([api.rescan(), api.listCategories()]);
      setSounds(list);
      setCategories(cats);
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
      if (e.key === "Escape") void hide();
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

  const act = (run: () => Promise<void>) => void run().catch((e) => setError(String(e)));

  return (
    <div className="quick">
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
        <CategoryMenu value={filter} options={options} onChange={setFilter} />
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
          <p className="empty">{sounds.length === 0 ? "No sounds yet." : "No sounds found."}</p>
        ) : (
          <div className="pads quick-pads">
            {visible.map((s) => (
              <Pad
                key={s.fileName}
                entry={s}
                accent={s.meta.color ?? (s.meta.category ? (categories[s.meta.category]?.color ?? null) : null)}
                selected={false}
                instances={playing.filter((p) => p.fileName === s.fileName && !p.previewing).length}
                previewing={playing.some((p) => p.fileName === s.fileName && p.previewing)}
                onSelect={noop}
                onPlay={() => act(() => api.playSound(s.fileName))}
                onStop={() => act(() => api.stopSound(s.fileName, false))}
                onPreview={() => act(() => api.previewSound(s.fileName))}
                onStopPreview={() => act(() => api.stopSound(s.fileName, true))}
                onForget={() => act(async () => {
                  await api.forgetSound(s.fileName);
                  await refresh();
                })}
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
