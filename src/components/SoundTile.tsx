import type { SoundEntry } from "../types";
import { hotkeyLabel, stemOf } from "../names";
import type { Counts } from "../playback";
import { PlayingBadge } from "./PlayingBadge";
import { colorStyle } from "../colorTokens";

type Props = {
  entry: SoundEntry;
  /** Category or per-sound colour, `#rrggbb`, or null for neutral. Sets the plate and tint. */
  accent: string | null;
  /** Voices still sounding per output. Play always starts one more. */
  counts: Counts;
  onPlay: () => void;
  onPreview: () => void;
};

/**
 * One small tile in the Quick Panel grid. Left click plays on the main output, right click
 * previews on the headphones. Stopping is done with the panel's Stop button, not per tile.
 */
export function SoundTile({ entry, accent, counts, onPlay, onPreview }: Props) {
  const name = stemOf(entry.fileName);
  const missing = entry.missing;
  const { main, preview } = counts;
  const playing = main > 0;
  const previewing = preview > 0;
  const classes = ["tile", playing && "is-playing", previewing && "is-previewing", missing && "is-missing"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={colorStyle(accent)}>
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
          <span className="tile-plate">{missing ? "!" : (entry.meta.emoji ?? "♪")}</span>
        </span>
        <span className="tile-name">{missing ? "File missing" : name}</span>
      </button>

      {entry.meta.hotkey && !missing && <span className="tile-key">{hotkeyLabel(entry.meta.hotkey)}</span>}
      {(playing || previewing) && !missing && (
        <div className="tile-status">
          {playing && <PlayingBadge output="main" count={main} />}
          {previewing && <PlayingBadge output="preview" count={preview} />}
        </div>
      )}
    </div>
  );
}
