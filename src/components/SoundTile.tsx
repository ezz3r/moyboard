import { Headphones, Square } from "lucide-react";
import type { CSSProperties } from "react";
import type { SoundEntry } from "../types";
import { hotkeyLabel, stemOf } from "../names";

type Props = {
  entry: SoundEntry;
  /** Category or per-sound colour, `#rrggbb`. Drawn as a stripe on the top edge. */
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
 * One small tile in the Quick Panel grid. The tile itself plays; preview and stop
 * appear on hover or focus. Stop shows only while the sound plays.
 */
export function SoundTile({ entry, accent, instances, previewing, onPlay, onStop, onPreview, onStopPreview }: Props) {
  const name = stemOf(entry.fileName);
  const missing = entry.missing;
  const playing = instances > 0;
  const classes = ["tile", playing && "is-playing", previewing && "is-previewing", missing && "is-missing"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}>
      <button
        type="button"
        className="tile-play"
        onClick={onPlay}
        disabled={missing}
        aria-label={missing ? `${name}, file missing` : `Play ${name}`}
        title={name}
      >
        <span className="tile-glyph" aria-hidden="true">
          {missing ? "!" : (entry.meta.emoji ?? "♪")}
        </span>
        <span className="tile-name">{missing ? "File missing" : name}</span>
      </button>

      {entry.meta.hotkey && !missing && <span className="tile-key">{hotkeyLabel(entry.meta.hotkey)}</span>}
      {instances > 1 && (
        <span className="tile-count" aria-label={`${instances} playing`}>
          x{instances}
        </span>
      )}
      {playing && (
        <span className="tile-eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}

      {!missing && (
        <div className="tile-actions">
          {playing && (
            <button
              type="button"
              className="tile-btn"
              onClick={onStop}
              aria-label={`Stop all ${instances > 1 ? `${instances} instances of ` : ""}${name}`}
              title="Stop all instances"
            >
              <Square size={10} fill="currentColor" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="tile-btn"
            aria-pressed={previewing}
            onClick={previewing ? onStopPreview : onPreview}
            aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name} on headphones`}
            title={previewing ? "Stop preview" : "Preview on headphones"}
          >
            {previewing ? <Square size={10} fill="currentColor" aria-hidden="true" /> : <Headphones size={12} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
