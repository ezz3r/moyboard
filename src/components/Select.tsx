import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Accessible name. Required: the trigger shows only the current label. */
  "aria-label": string;
  className?: string;
};

/**
 * Dropdown drawn in the app's own style, replacing the native select so the popup matches the
 * rest of the UI. Same keyboard model as CategoryMenu: arrows move, Enter picks, Escape closes.
 * The list opens upward when there is more room above the trigger (the bottom bar sits low).
 */
export function Select({ value, options, onChange, className, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  // Opening focuses the current option, so the keyboard starts where the user is.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>("[aria-selected=true]")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && trigger.current) {
      const r = trigger.current.getBoundingClientRect();
      const roomBelow = window.innerHeight - r.bottom;
      setUp(roomBelow < 240 && r.top > roomBelow);
    }
    setOpen((o) => !o);
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=option]"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
    items[next]?.focus();
    e.preventDefault();
  };

  const pick = (v: string) => {
    setOpen(false);
    trigger.current?.focus();
    if (v !== value) onChange(v);
  };

  return (
    <div className={`select${className ? ` ${className}` : ""}`} ref={wrap}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest["aria-label"]}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="select-label">{current?.label ?? ""}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={list}
          id={listId}
          className={`select-pop${up ? " is-up" : ""}`}
          role="listbox"
          aria-label={rest["aria-label"]}
          onKeyDown={onListKey}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value || "__none"}
                type="button"
                role="option"
                aria-selected={selected}
                className="select-option"
                onClick={() => pick(o.value)}
              >
                <span className="select-check" aria-hidden="true">
                  {selected && <Check size={14} />}
                </span>
                <span className="select-option-label">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
