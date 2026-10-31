import { Headphones, Play, Square } from "lucide-react";
import type { CSSProperties } from "react";
import type { SoundEntry } from "../types";
import { hotkeyLabel, stemOf } from "../names";

type Props = {
  entry: SoundEntry;
  /** Category or per-sound colour, `#rrggbb`. Drawn as a stripe on the left edge. */
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
 * One sound tile. The button row is the main content and is always visible. The info row
 * (icon and name) selects the sound for the sidebar; it never plays.
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
      <span className="pad-glyph" aria-hidden="true">
        {missing ? "!" : (entry.meta.emoji ?? "♪")}
      </span>

      {missing ? null : (
        <div className="pad-row">
          <button
            type="button"
            className="pad-btn pad-stop"
            onClick={onStop}
            disabled={!playing}
            aria-label={`Stop all ${instances > 1 ? `${instances} instances of ` : ""}${name}`}
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
          {instances > 1 && (
            <span className="pad-count" aria-label={`${instances} playing`}>
              x{instances}
            </span>
          )}
          {playing && (
            <span className="pad-eq" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
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
