import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown, Pencil, Plus } from "lucide-react";

export type CategoryOption = {
  key: string;
  label: string;
  /** `#rrggbb` dot, or null for the pseudo entries (All, Uncategorized). */
  color: string | null;
  count: number;
};

type Props = {
  value: string;
  options: CategoryOption[];
  onChange: (key: string) => void;
  /** Omit to hide the entry. */
  onNew?: () => void;
  /** Opens the category editor for the current value. Omit to hide the button. */
  onEdit?: () => void;
  /** False disables the edit button (the value is All or Uncategorized). */
  editable?: boolean;
};

/** Top-bar category switcher: a listbox popover with colour dots, plus the edit and new actions. */
export function CategoryMenu({ value, options, onChange, onNew, onEdit, editable = true }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.key === value) ?? options[0];

  // Close on a click outside, or Escape from anywhere in the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Arrow keys move between options; the list is short, so no wrapping logic beyond the ends.
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
    items[next]?.focus();
    e.preventDefault();
  };

  return (
    <div className="cat-menu" ref={wrap}>
      <button
        type="button"
        className="cat-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Category: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Dot color={current.color} />
        <span className="cat-trigger-label">{current.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {onEdit && (
        <button
          type="button"
          className="btn-icon"
          aria-label="Edit category"
          title={editable ? "Edit this category" : "Pick a category to edit it"}
          disabled={!editable}
          onClick={() => {
            setOpen(false);
            onEdit();
          }}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div id={listId} className="cat-pop" role="listbox" aria-label="Categories" onKeyDown={onListKey}>
          {options.map((o) => {
            const selected = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={selected}
                className="cat-option"
                style={o.color ? ({ "--accent": o.color } as CSSProperties) : undefined}
                onClick={() => {
                  setOpen(false);
                  onChange(o.key);
                }}
              >
                <span className="cat-check" aria-hidden="true">
                  {selected && <Check size={14} />}
                </span>
                <Dot color={o.color} />
                <span className="cat-option-label">{o.label}</span>
                <span className="count">{o.count}</span>
              </button>
            );
          })}
          {onNew && (
            <button
              type="button"
              className="cat-option cat-new"
              onClick={() => {
                setOpen(false);
                onNew();
              }}
            >
              <Plus size={14} aria-hidden="true" />
              New category
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Dot({ color }: { color: string | null }) {
  return (
    <span
      className={`swatch-dot${color ? "" : " is-empty"}`}
      aria-hidden="true"
      style={color ? ({ "--accent": color } as CSSProperties) : undefined}
    />
  );
}
