import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { EmojiField } from "./EmojiField";
import { HotkeyField } from "./HotkeyField";
import { TrimEditor } from "./TrimEditor";
import { extOf, stemOf } from "../names";
import { ColorPicker } from "./ColorPicker";
import { Select } from "./Select";
import type { SoundEntry, SoundMeta } from "../types";

type Props = {
  entry: SoundEntry;
  sounds: SoundEntry[];
  /** Every category, as id and display name, sorted by name. */
  categories: { id: string; name: string }[];
  onChanged: () => void;
  onRenamed: (newName: string) => void;
  onExported: (newName: string) => void;
  onDelete: () => void;
  onError: (message: string) => void;
};

/**
 * Sidebar editor for one sound. Each change saves on its own (no Save button),
 * so the panel can stay open while the user clicks around the pads.
 * Mounted with `key={fileName}`, so local drafts reset per sound.
 */
export function SoundPanel({ entry, sounds, categories, onChanged, onRenamed, onExported, onDelete, onError }: Props) {
  const ext = extOf(entry.fileName);
  const [stem, setStem] = useState(stemOf(entry.fileName));
  const [volume, setVolume] = useState(entry.meta.volume ?? 1);

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

  const hotkey = entry.meta.hotkey;
  const clash = hotkey ? sounds.find((s) => s.fileName !== entry.fileName && s.meta.hotkey === hotkey) : undefined;

  // The card is split into three sections with a heading each: what the sound is, how it plays,
  // and how it is trimmed. Deleting sits apart at the bottom.
  return (
    <div className="panel sound-panel">
      <Section title="Sound">
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

        <div className="field-row">
          <EmojiField value={entry.meta.emoji} onChange={(e) => void save({ emoji: e })} />
          <div className="field grow">
            <span>Category</span>
            <Select
              aria-label="Category"
              value={entry.meta.category ?? ""}
              options={[{ value: "", label: "Uncategorized" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
              onChange={(v) => void save({ category: v || null })}
            />
          </div>
        </div>

        <div className="field">
          <span>Colour</span>
          <ColorPicker
            label="Pad colour"
            value={entry.meta.color ?? null}
            resetLabel="Use category colour"
            onChange={(c) => void save({ color: c })}
            onError={onError}
          />
        </div>
      </Section>

      <Section title="Playback">
        <label className="field">
          <span className="field-head">
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
            <HotkeyField value={hotkey ?? null} onChange={(h) => void save({ hotkey: h })} />
            {hotkey && (
              <button type="button" className="btn btn-quiet" onClick={() => void save({ hotkey: null })}>
                Clear
              </button>
            )}
          </span>
          {clash && <p className="warn">{stemOf(clash.fileName)} already uses this hotkey.</p>}
        </div>
      </Section>

      <Section title="Trim" bare>
        <TrimEditor key={entry.fileName} entry={entry} onSaved={onChanged} onExported={onExported} />
      </Section>

      <div className="panel-foot">
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Delete sound
        </button>
        <p className="hint">Moves the file to the Recycle Bin. Shortcut: Delete key with the pad selected.</p>
      </div>
    </div>
  );
}

/** One titled block of the edit card. `bare` skips the heading when the child brings its own. */
function Section({ title, bare, children }: { title: string; bare?: boolean; children: ReactNode }) {
  return (
    <section className="edit-section" aria-label={title}>
      {!bare && <h3 className="edit-heading">{title}</h3>}
      {children}
    </section>
  );
}
