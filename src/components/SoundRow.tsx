import { Headphones, Square } from "lucide-react";
import type { CSSProperties } from "react";
import type { SoundEntry } from "../types";
import { hotkeyLabel, stemOf } from "../names";

type Props = {
  entry: SoundEntry;
  /** Category or per-sound colour, `#rrggbb`. Drawn as a stripe on the left. */
  accent: string | null;
  /** Main-output instances still sounding. Play always starts one more. */
  instances: number;
  previewing: boolean;
  onPlay: () => void;
  onStop: () => void;
  onPreview: () => void;
  onStopPreview: () => void;
};

/**
 * One line in the Quick Panel list. The name is the play button; the row actions
 * (preview, stop) appear on hover or focus. Stop shows only while the sound plays.
 */
export function SoundRow({ entry, accent, instances, previewing, onPlay, onStop, onPreview, onStopPreview }: Props) {
  const name = stemOf(entry.fileName);
  const playing = instances > 0;
  const missing = entry.missing;
  const classes = ["row", playing && "is-playing", previewing && "is-previewing", missing && "is-missing"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}>
      <button
        type="button"
        className="row-play"
        onClick={onPlay}
        disabled={missing}
        aria-label={missing ? `${name}, file missing` : `Play ${name}`}
        title={name}
      >
        <span className="row-glyph" aria-hidden="true">
          {missing ? "!" : (entry.meta.emoji ?? "♪")}
        </span>
        <span className="row-name">{name}</span>
        {missing && <span className="row-note">File missing</span>}
        {entry.meta.hotkey && !missing && <span className="row-key">{hotkeyLabel(entry.meta.hotkey)}</span>}
        {playing && (
          <span className="row-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        {instances > 1 && <span className="row-count" aria-label={`${instances} playing`}>x{instances}</span>}
      </button>
      <div className="row-actions">
        {playing && !missing && (
          <button type="button" className="row-btn" onClick={onStop} aria-label={`Stop all ${instances > 1 ? `${instances} instances of ` : ""}${name}`} title="Stop all instances">
            <Square size={12} fill="currentColor" aria-hidden="true" />
          </button>
        )}
        {!missing && (
        <button
          type="button"
          className="row-btn"
          aria-pressed={previewing}
          onClick={previewing ? onStopPreview : onPreview}
          aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name} on headphones`}
          title={previewing ? "Stop preview" : "Preview on headphones"}
        >
          {previewing ? <Square size={12} fill="currentColor" aria-hidden="true" /> : <Headphones size={14} aria-hidden="true" />}
        </button>
        )}
      </div>
    </div>
  );
}
