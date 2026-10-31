import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { EMOJIS } from "../emojis";
import { HotkeyField } from "./HotkeyField";
import { extOf, stemOf } from "../names";
import type { SoundEntry } from "../types";

type Props = {
  entry: SoundEntry;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
  onTrim: () => void;
};

export function EditSound({ entry, categories, onClose, onSaved, onTrim }: Props) {
  const ext = extOf(entry.fileName);
  const [stem, setStem] = useState(stemOf(entry.fileName));
  const [emoji, setEmoji] = useState(entry.meta.emoji ?? "");
  const [category, setCategory] = useState(entry.meta.category ?? "");
  const [volume, setVolume] = useState(entry.meta.volume ?? 1);
  const [hotkey, setHotkey] = useState(entry.meta.hotkey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    const name = stem.trim();
    if (!name) return setError("Name cannot be empty.");
    setBusy(true);
    setError(null);
    try {
      let file = entry.fileName;
      if (name + ext !== entry.fileName) file = await api.renameSound(entry.fileName, name + ext);
      await api.setSoundMeta(file, {
        ...entry.meta,
        emoji: emoji || null,
        category: category.trim() || null,
        volume,
        hotkey,
      });
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id={titleId}>Edit sound</h2>

        <label className="field">
          <span>Name</span>
          <span className="name-row">
            <input value={stem} onChange={(e) => setStem(e.target.value)} autoFocus />
            <span className="ext">{ext}</span>
          </span>
        </label>

        <fieldset className="field">
          <legend>Icon</legend>
          <div className="emoji-grid">
            <button
              type="button"
              className="emoji-cell emoji-none"
              aria-pressed={emoji === ""}
              onClick={() => setEmoji("")}
            >
              None
            </button>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji-cell"
                aria-label={e}
                aria-pressed={emoji === e}
                onClick={() => setEmoji(e)}
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
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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

        <div className="field">
          <span>Hotkey</span>
          <span className="hotkey-row">
            <HotkeyField value={hotkey} onChange={setHotkey} />
            {hotkey && (
              <button type="button" className="btn btn-quiet" onClick={() => setHotkey(null)}>
                Clear
              </button>
            )}
          </span>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="sheet-actions sheet-split">
          <button type="button" className="btn btn-quiet" onClick={onTrim} disabled={busy}>
            {entry.meta.trimStart != null || entry.meta.trimEnd != null ? "Trimmed. Edit trim" : "Trim"}
          </button>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
