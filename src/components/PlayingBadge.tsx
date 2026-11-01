import { Headphones, Speaker } from "lucide-react";

type Props = {
  output: "main" | "preview";
  /** Voices still sounding on this output. The count shows above one. */
  count: number;
};

/**
 * Shows that a sound plays on one output: icon, equalizer bars and the count.
 * The icon and bars carry the meaning too, so the colour is never the only cue.
 */
export function PlayingBadge({ output, count }: Props) {
  const isMain = output === "main";
  const Icon = isMain ? Speaker : Headphones;
  const label = isMain ? "Playing on the main output" : "Previewing on headphones";
  return (
    <span
      className={`playing-badge is-${output}`}
      role="img"
      aria-label={count > 1 ? `${label}, ${count} instances` : label}
      title={label}
    >
      <Icon size={12} aria-hidden="true" />
      <span className="playing-eq" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {count > 1 && <span className="playing-count">x{count}</span>}
    </span>
  );
}
