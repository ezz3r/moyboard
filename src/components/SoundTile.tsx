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
  onPreview: () => void;
};

/**
 * One small tile in the Quick Panel grid. Left click plays on the main output, right click
 * previews on the headphones. Stopping is done with the panel's Stop button, not per tile.
 */
export function SoundTile({ entry, accent, instances, previewing, onPlay, onPreview }: Props) {
  const name = stemOf(entry.fileName);
  const missing = entry.missing;
  const playing = instances > 0;
  const classes = ["tile", playing && "is-playing", previewing && "is-previewing", missing && "is-missing"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={accent ? ({ "--cat": accent } as CSSProperties) : undefined}>
      <button
        type="button"
        className="tile-play"
        onClick={onPlay}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!missing) onPreview();
        }}
        disabled={missing}
        aria-label={missing ? `${name}, file missing` : `Play ${name}`}
        title={`${name}\nLeft click: play · Right click: preview`}
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

    </div>
  );
}
