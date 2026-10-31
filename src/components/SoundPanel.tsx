import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { EMOJIS } from "../emojis";
import { HotkeyField } from "./HotkeyField";
import { TrimEditor } from "./TrimEditor";
import { extOf, stemOf } from "../names";
import type { SoundEntry, SoundMeta } from "../types";

type Props = {
  entry: SoundEntry;
  sounds: SoundEntry[];
  categories: string[];
  onChanged: () => void;
  onRenamed: (newName: string) => void;
  onExported: (newName: string) => void;
  onError: (message: string) => void;
};

/**
 * Sidebar editor for one sound. Each change saves on its own (no Save button),
 * so the panel can stay open while the user clicks around the pads.
 * Mounted with `key={fileName}`, so local drafts reset per sound.
 */
export function SoundPanel({ entry, sounds, categories, onChanged, onRenamed, onExported, onError }: Props) {
  const ext = extOf(entry.fileName);
  const [stem, setStem] = useState(stemOf(entry.fileName));
  const [category, setCategory] = useState(entry.meta.category ?? "");
  const [volume, setVolume] = useState(entry.meta.volume ?? 1);
  const listId = `cats-${entry.fileName}`;

  // Saves are queued and built on the latest known meta, so two quick edits
  // (emoji, then category) do not overwrite each other before the rescan lands.
  const latest = useRef(entry.meta);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    latest.current = entry.meta;
  }, [entry.meta]);

  function save(patch: Partial<SoundMeta>): Promise<void> {
    const run = queue.current.then(async () => {
      const next = { ...latest.current, ...patch };
      try {
        await api.setSoundMeta(entry.fileName, next);
        latest.current = next;
        onChanged();
      } catch (e) {
        onError(String(e));
        throw e;
      }
    });
    queue.current = run.catch(() => {});
    return run;
  }

  // Volume is a slider: save 250 ms after the last move.
  useEffect(() => {
    const saved = entry.meta.volume ?? 1;
    if (volume === saved) return;
    const t = window.setTimeout(() => void save({ volume }).catch(() => setVolume(saved)), 250);
    return () => window.clearTimeout(t);
  }, [volume]);

  async function rename() {
    const name = stem.trim();
    if (!name) {
      setStem(stemOf(entry.fileName));
      return onError("Name cannot be empty.");
    }
    if (name + ext === entry.fileName) return;
    try {
      onRenamed(await api.renameSound(entry.fileName, name + ext));
    } catch (e) {
      setStem(stemOf(entry.fileName));
      onError(String(e));
    }
  }

  async function commitCategory() {
    const next = category.trim() || null;
    if (next === (entry.meta.category ?? null)) return;
    await save({ category: next }).catch(() => setCategory(entry.meta.category ?? ""));
  }

  const hotkey = entry.meta.hotkey;
  const clash = hotkey ? sounds.find((s) => s.fileName !== entry.fileName && s.meta.hotkey === hotkey) : undefined;

  return (
    <div className="panel">
      <label className="field">
        <span>Name</span>
        <span className="name-row">
          <input
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <span className="ext">{ext}</span>
        </span>
      </label>

      <label className="field">
        <span>
          Volume <output className="value">{Math.round(volume * 100)}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>

      <fieldset className="field">
        <legend>Icon</legend>
        <div className="emoji-grid">
          <button
            type="button"
            className="emoji-cell emoji-none"
            aria-pressed={!entry.meta.emoji}
            onClick={() => void save({ emoji: null })}
          >
            None
          </button>
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="emoji-cell"
              aria-label={e}
              aria-pressed={entry.meta.emoji === e}
              onClick={() => void save({ emoji: e })}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Category</span>
        <input
          value={category}
          list={listId}
          placeholder="None"
          onChange={(e) => setCategory(e.target.value)}
          onBlur={() => void commitCategory()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <div className="field">
        <span>Hotkey</span>
        <span className="hotkey-row">
          <HotkeyField value={hotkey ?? null} onChange={(h) => void save({ hotkey: h })} />
          {hotkey && (
            <button type="button" className="btn btn-quiet" onClick={() => void save({ hotkey: null })}>
              Clear
            </button>
          )}
        </span>
        {clash && <p className="warn">{stemOf(clash.fileName)} already uses this hotkey.</p>}
      </div>

      <TrimEditor
        key={entry.fileName}
        entry={entry}
        onSaved={onChanged}
        onExported={onExported}
      />
    </div>
  );
}
