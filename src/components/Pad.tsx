import type { SoundEntry } from "../types";
import { stemOf } from "../names";

type Props = {
  entry: SoundEntry;
  playing: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onForget: () => void;
};

export function Pad({ entry, playing, onPlay, onEdit, onForget }: Props) {
  const name = stemOf(entry.fileName);
  const classes = ["pad", playing && "is-playing", entry.missing && "is-missing"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <button
        type="button"
        className="pad-play"
        onClick={onPlay}
        disabled={entry.missing}
        aria-label={entry.missing ? `${name}, file missing` : `Play ${name}`}
      >
        <span className="pad-glyph" aria-hidden="true">
          {entry.missing ? "!" : entry.meta.emoji ?? "♪"}
        </span>
        <span className="pad-name">{name}</span>
        {entry.missing && <span className="pad-note">File missing</span>}
      </button>
      {entry.missing ? (
        <button type="button" className="pad-action" onClick={onForget}>
          Forget
        </button>
      ) : (
        <button type="button" className="pad-action" onClick={onEdit} aria-label={`Edit ${name}`}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M11.2 2.3a1.4 1.4 0 0 1 2 2L5.6 12.4 2.5 13.5l1.1-3.1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
