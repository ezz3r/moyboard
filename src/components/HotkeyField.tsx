import { useState } from "react";

const MODIFIER_CODES = new Set([
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight",
]);

type Props = {
  value: string | null;
  onChange: (hotkey: string | null) => void;
  id?: string;
};

/**
 * Press-to-record hotkey. Builds strings like "Ctrl+Shift+Digit1" in the form the
 * backend parses. Esc cancels, Backspace clears.
 */
export function HotkeyField({ value, onChange, id }: Props) {
  const [recording, setRecording] = useState(false);

  return (
    <button
      id={id}
      type="button"
      className={`hotkey${recording ? " is-recording" : ""}`}
      aria-label={`Hotkey, ${value ?? "none"}. Press to record.`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        if (e.key === "Escape") return setRecording(false);
        if (e.key === "Backspace" || e.key === "Delete") {
          onChange(null);
          return setRecording(false);
        }
        if (MODIFIER_CODES.has(e.code)) return;
        const parts: string[] = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Super");
        parts.push(e.code);
        onChange(parts.join("+"));
        setRecording(false);
      }}
    >
      {recording ? "Press keys…" : value ?? "None"}
    </button>
  );
}
