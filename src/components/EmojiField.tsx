import { lazy, Suspense, useEffect, useRef, useState } from "react";

const EmojiPicker = lazy(() => import("./EmojiPicker"));

type Props = {
  value: string | null;
  onChange: (emoji: string | null) => void;
};

/** Icon button that opens the emoji picker in a popover. Closes on pick, Escape, or outside click. */
export function EmojiField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="field emoji-field" ref={wrap}>
      <span>Icon</span>
      <button
        type="button"
        className="emoji-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `Icon ${value}. Change icon` : "No icon. Choose icon"}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{value ?? "+"}</span>
      </button>

      {open && (
        <div className="emoji-pop" role="dialog" aria-label="Choose icon">
          <Suspense fallback={<p className="hint">Loading icons…</p>}>
            <EmojiPicker
              onPick={(e) => {
                onChange(e);
                setOpen(false);
              }}
            />
          </Suspense>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Remove icon
          </button>
        </div>
      )}
    </div>
  );
}
