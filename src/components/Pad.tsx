import { Headphones, Play, Square } from "lucide-react";
import type { PointerEvent } from "react";
import type { SoundEntry } from "../types";
import { hotkeyLabel, stemOf } from "../names";
import type { Counts } from "../playback";
import { PlayingBadge } from "./PlayingBadge";
import { colorStyle } from "../colorTokens";

type Props = {
  entry: SoundEntry;
  /** Category or per-sound colour, `#rrggbb`, or null for neutral. Sets the plate and tint. */
  accent: string | null;
  selected: boolean;
  /** Voices still sounding per output. Play always starts one more. */
  counts: Counts;
  onSelect: () => void;
  onPlay: () => void;
  onStop: () => void;
  onPreview: () => void;
  onStopPreview: () => void;
  onForget: () => void;
  /** Starts a drag onto a category (see dragToCategory.ts). */
  onDragStart?: (e: PointerEvent<HTMLElement>) => void;
};

/**
 * One sound tile. The button row is the main content and is always visible. The info row
 * (icon and name) selects the sound for the sidebar; it never plays.
 */
export function Pad({
  entry,
  accent,
  selected,
  counts,
  onSelect,
  onPlay,
  onStop,
  onPreview,
  onStopPreview,
  onForget,
  onDragStart,
}: Props) {
  const name = stemOf(entry.fileName);
  const missing = entry.missing;
  const { main, preview } = counts;
  const playing = main > 0;
  const previewing = preview > 0;
  const classes = [
    "pad",
    selected && "is-selected",
    playing && "is-playing",
    previewing && "is-previewing",
    missing && "is-missing",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={colorStyle(accent)} onPointerDown={onDragStart}>
      <span className="pad-glyph" aria-hidden="true">
        <span className="pad-plate">{missing ? "!" : (entry.meta.emoji ?? "♪")}</span>
      </span>

      {missing ? null : (
        <div className="pad-row">
          <button
            type="button"
            className="pad-btn pad-stop"
            onClick={onStop}
            disabled={!playing}
            aria-label={`Stop all ${main > 1 ? `${main} instances of ` : ""}${name}`}
            title="Stop all instances"
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="pad-btn pad-play"
            onClick={onPlay}
            aria-label={`Play ${name}`}
            title="Play another instance"
          >
            <Play size={20} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="pad-btn"
            aria-pressed={previewing}
            onClick={previewing ? onStopPreview : onPreview}
            aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name} on headphones`}
            title={previewing ? "Stop preview" : "Preview on headphones"}
          >
            {previewing ? (
              <Square size={14} fill="currentColor" aria-hidden="true" />
            ) : (
              <Headphones size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      <button
        type="button"
        className="pad-select"
        onClick={onSelect}
        disabled={missing}
        title={missing ? `${name} (file missing)` : name}
        aria-current={selected ? "true" : undefined}
        aria-label={missing ? `${name}, file missing` : `Select ${name}`}
      >
        <span className="pad-name">{name}</span>
      </button>

      {missing && (
        <div className="pad-missing-foot">
          <span className="pad-note">File missing</span>
          <button type="button" className="pad-forget" onClick={onForget}>
            Forget
          </button>
        </div>
      )}

      {(playing || previewing) && !missing && (
        <div className="pad-status">
          {playing && <PlayingBadge output="main" count={main} />}
          {previewing && <PlayingBadge output="preview" count={preview} />}
        </div>
      )}

      {entry.meta.hotkey && !missing && (
        <span className="pad-key" title={`Hotkey ${hotkeyLabel(entry.meta.hotkey)}`}>
          {hotkeyLabel(entry.meta.hotkey)}
        </span>
      )}
    </div>
  );
}
