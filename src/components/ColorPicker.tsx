import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { X } from "lucide-react";
import { api } from "../api";
import { COLOR_PRESETS } from "../colors";

const FALLBACK = "#8e8e93";
const HEX = /^#?([0-9a-f]{6})$/i;
const SETTLE_MS = 300;

type Props = {
  label: string;
  /** Saved colour, `#rrggbb`. `null` means none or inherit. */
  value: string | null;
  onChange: (color: string | null) => void;
  /** What removing the colour means, e.g. "Use category colour" or "No colour". Shown as the X's tooltip. */
  resetLabel: string;
  onError: (message: string) => void;
};

/**
 * Colour swatch that opens a popover: a saturation and hue area, a hex field, preset swatches and
 * recent custom colours. Dragging saves after a short pause; closing saves at once. A red X beside
 * the swatch removes the colour.
 */
export function ColorPicker({ label, value, onChange, resetLabel, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? FALLBACK);
  const [text, setText] = useState(draft);
  const [invalid, setInvalid] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [pos, setPos] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const savedRef = useRef(value);
  savedRef.current = value;

  const presetHexes = COLOR_PRESETS.map((p) => p.hex);

  // Saves `c`. A custom colour (not a preset) also goes to the recent list.
  const apply = (c: string, remember: boolean) => {
    window.clearTimeout(timer.current);
    setDraft(c);
    setText(c);
    setInvalid(false);
    if (c !== savedRef.current) onChange(c);
    if (remember && !presetHexes.includes(c)) {
      api
        .pushRecentColor(c)
        .then(() => api.getRecentColors().then(setRecent))
        .catch((e) => onError(String(e)));
    }
  };

  const close = () => {
    window.clearTimeout(timer.current);
    if (open && draft !== savedRef.current) apply(draft, true);
    setOpen(false);
  };

  const openPicker = () => {
    setDraft(value ?? FALLBACK);
    setText(value ?? FALLBACK);
    setInvalid(false);
    api.getRecentColors().then(setRecent).catch((e) => onError(String(e)));
    setOpen(true);
  };

  // Place below the trigger, flip above when there is no room, keep inside the window.
  useLayoutEffect(() => {
    if (!open || !trigger.current || !pop.current) return;
    const r = trigger.current.getBoundingClientRect();
    const ph = pop.current.offsetHeight;
    const pw = pop.current.offsetWidth;
    const below = r.bottom + 6;
    const top = below + ph > window.innerHeight - 8 ? Math.max(8, r.top - ph - 6) : below;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
    setPos({ top, left });
    pop.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !trigger.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  const onHexText = (t: string) => {
    setText(t);
    const m = t.trim().match(HEX);
    if (!m) {
      setInvalid(t.trim() !== "");
      return;
    }
    apply(`#${m[1].toLowerCase()}`, false);
  };

  const shown = open ? draft : value;

  return (
    <span className="color-row">
      <button
        ref={trigger}
        type="button"
        className={`swatch color-trigger${shown ? "" : " swatch-none"}`}
        style={shown ? { background: shown } : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${shown ?? "none"}. Change colour`}
        title={label}
        onClick={() => (open ? close() : openPicker())}
      >
        {shown ? null : "–"}
      </button>

      {value !== null && (
        <button
          type="button"
          className="color-clear"
          aria-label={`Remove ${label.toLowerCase()}`}
          title={resetLabel}
          onClick={() => {
            window.clearTimeout(timer.current);
            setOpen(false);
            onChange(null);
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}

      {open &&
        createPortal(
          <div ref={pop} className="color-pop" role="dialog" aria-label={label} tabIndex={-1} style={pos}>
            <HexColorPicker
              color={draft}
              onChange={(c) => {
                setDraft(c);
                setText(c);
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => apply(c, false), SETTLE_MS);
              }}
            />

            <div className="color-hex">
              <label>
                <span>Hex</span>
                <input
                  className="color-hex-input"
                  value={text}
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={invalid}
                  aria-describedby="color-hex-error"
                  onChange={(e) => onHexText(e.target.value)}
                  onBlur={() => {
                    if (invalid) {
                      setText(draft);
                      setInvalid(false);
                    }
                  }}
                />
              </label>
              {/* Always rendered, so showing the message does not shift the swatches under the pointer. */}
              <span id="color-hex-error" className="color-hex-error" role="alert">
                {invalid ? "Use six hex digits, like #5fb3c9." : ""}
              </span>
            </div>

            <div className="swatches" role="radiogroup" aria-label="Preset colours">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  role="radio"
                  className="swatch"
                  style={{ background: p.hex }}
                  aria-checked={draft === p.hex}
                  aria-label={p.name}
                  title={`${p.name} ${p.hex}`}
                  onClick={() => apply(p.hex, false)}
                />
              ))}
            </div>

            {recent.length > 0 && (
              <div className="swatches" role="radiogroup" aria-label="Recent colours">
                {recent.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    className="swatch"
                    style={{ background: c }}
                    aria-checked={draft === c}
                    aria-label={`Recent colour ${c}`}
                    title={c}
                    onClick={() => apply(c, false)}
                  />
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
