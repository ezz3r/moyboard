import { Headphones, Play, Square } from "lucide-react";
import type { CSSProperties } from "react";
import type { SoundEntry } from "../types";
import { stemOf } from "../names";

type Props = {
  entry: SoundEntry;
  /** Category or per-sound colour, `#rrggbb`. Drawn as a stripe on the top edge. */
  accent: string | null;
  selected: boolean;
  /** Number of main-output instances still sounding. Play always starts one more. */
  instances: number;
  previewing: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onStop: () => void;
  onPreview: () => void;
  onStopPreview: () => void;
  onForget: () => void;
};

/**
 * One sound tile. The body selects the sound for the sidebar; it never plays.
 * The controls sit on top of the body, so they are siblings, not children, of the select button.
 */
export function Pad({
  entry,
  accent,
  selected,
  instances,
  previewing,
  onSelect,
  onPlay,
  onStop,
  onPreview,
  onStopPreview,
  onForget,
}: Props) {
  const name = stemOf(entry.fileName);
  const missing = entry.missing;
  const playing = instances > 0;
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
    <div className={classes} style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}>
      <button
        type="button"
        className="pad-select"
        onClick={onSelect}
        disabled={missing}
        aria-current={selected ? "true" : undefined}
        aria-label={missing ? `${name}, file missing` : `Select ${name}`}
      >
        <span className="pad-glyph" aria-hidden="true">
          {missing ? "!" : entry.meta.emoji ?? "♪"}
        </span>
        <span className="pad-name">{name}</span>
        {missing && <span className="pad-note">File missing</span>}
      </button>

      {instances > 1 && (
        <span className="pad-count" aria-label={`${instances} playing`}>
          x{instances}
        </span>
      )}

      {playing && !missing && (
        <button
          type="button"
          className="pad-stop"
          onClick={onStop}
          aria-label={`Stop all ${instances > 1 ? `${instances} instances of ` : ""}${name}`}
          title="Stop all instances"
        >
          <Square size={18} fill="currentColor" aria-hidden="true" />
        </button>
      )}

      {missing ? (
        <button type="button" className="pad-forget" onClick={onForget}>
          Forget
        </button>
      ) : (
        <div className="pad-controls">
          <button
            type="button"
            className="pad-btn"
            onClick={onPlay}
            aria-label={`Play ${name}`}
            title="Play another instance"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
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
              <Headphones size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
