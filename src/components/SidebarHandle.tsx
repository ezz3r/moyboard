import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export const SIDEBAR_MIN = 280;
export const SIDEBAR_DEFAULT = 300;
/** Keyboard step in pixels. Hold Shift for a larger one. */
const STEP = 16;

type Props = {
  width: number;
  onChange: (width: number) => void;
  /** Called once a drag, key step or reset is done. Saves the width. */
  onCommit: (width: number) => void;
};

/**
 * Drag handle on the left edge of the edit sidebar. The sidebar is the element after this one.
 * Width is clamped to a minimum and to half the body, so the pad grid always keeps room.
 */
export function SidebarHandle({ width, onChange, onCommit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ right: number; width: number } | null>(null);

  const bodyWidth = () => ref.current?.parentElement?.clientWidth ?? window.innerWidth;
  const clamp = (w: number) => Math.round(Math.min(Math.max(w, SIDEBAR_MIN), Math.max(SIDEBAR_MIN, bodyWidth() / 2)));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const right = e.currentTarget.parentElement?.getBoundingClientRect().right ?? window.innerWidth;
    drag.current = { right, width };
    document.body.classList.add("is-resizing");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = clamp(drag.current.right - e.clientX);
    drag.current.width = next;
    onChange(next);
  };

  const endDrag = () => {
    if (!drag.current) return;
    const final = drag.current.width;
    drag.current = null;
    document.body.classList.remove("is-resizing");
    onCommit(final);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.shiftKey ? STEP * 4 : STEP) * (e.key === "ArrowLeft" ? 1 : -1);
    const next = clamp(width + step);
    onChange(next);
    onCommit(next);
  };

  return (
    <div
      ref={ref}
      className="sidebar-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        onChange(SIDEBAR_DEFAULT);
        onCommit(SIDEBAR_DEFAULT);
      }}
      onKeyDown={onKeyDown}
    />
  );
}
