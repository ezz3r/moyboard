import { COLORS } from "../colors";

type Props = {
  label: string;
  value: string | null;
  onChange: (color: string | null) => void;
  /** Adds a first option that clears the colour (per-sound: "inherit from category"). */
  inheritLabel?: string;
};

/** Small colour picker: a row of preset swatches, no free-form colour input. */
export function Swatches({ label, value, onChange, inheritLabel }: Props) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {inheritLabel !== undefined && (
        <button
          type="button"
          role="radio"
          className="swatch swatch-none"
          aria-checked={value === null}
          aria-label={inheritLabel}
          title={inheritLabel}
          onClick={() => onChange(null)}
        >
          –
        </button>
      )}
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          className="swatch"
          style={{ background: c }}
          aria-checked={value === c}
          aria-label={`Colour ${c}`}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
