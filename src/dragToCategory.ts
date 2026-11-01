import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Attribute on every drop target. Its value is the category id, or the Uncategorized key. */
export const DROP_ATTR = "data-drop-category";

const HOLD_MS = 220;
const SLOP_PX = 5;
const EDGE_PX = 48;
const EDGE_STEP = 14;

export type DragView = { fileName: string; x: number; y: number; over: string | null };

type Session = {
  fileName: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  moved: boolean;
  over: string | null;
  timer: number;
};

/**
 * Drags one pad onto a category. Pointer events only: HTML5 drag is switched off in WebView2
 * when OS file drop is on. A short hold or a small move starts the drag, so a plain click still
 * selects the pad. Esc cancels. A drop calls `onDrop` with the target key.
 */
export function useCategoryDrag(onDrop: (fileName: string, target: string) => void) {
  const [view, setView] = useState<DragView | null>(null);
  const session = useRef<Session | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  });

  const finish = useCallback(() => {
    const s = session.current;
    if (s) window.clearTimeout(s.timer);
    session.current = null;
    setView(null);
    document.body.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hit test under the pointer, and scroll the nearest scroller when the pointer is near an edge.
  const update = (s: Session) => {
    const el = document.elementFromPoint(s.x, s.y);
    s.over = el?.closest(`[${DROP_ATTR}]`)?.getAttribute(DROP_ATTR) ?? null;
    const scroller = nearestScroller(el);
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (s.y < r.top + EDGE_PX) scroller.scrollTop -= EDGE_STEP;
      else if (s.y > r.bottom - EDGE_PX) scroller.scrollTop += EDGE_STEP;
    }
    setView({ fileName: s.fileName, x: s.x, y: s.y, over: s.over });
  };

  function onMove(e: PointerEvent) {
    const s = session.current;
    if (!s) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.active) {
      if (Math.hypot(s.x - s.startX, s.y - s.startY) < SLOP_PX) return;
      activate(s);
    }
    s.moved = true;
    update(s);
  }

  function activate(s: Session) {
    s.active = true;
    window.clearTimeout(s.timer);
    document.body.classList.add("is-dragging");
    update(s);
  }

  function onUp() {
    const s = session.current;
    if (!s) return;
    const wasActive = s.active;
    const drop = s.active && s.over !== null ? s.over : null;
    const moved = s.moved;
    finish();
    if (!wasActive) return;
    if (moved) swallowNextClick();
    if (drop !== null) onDropRef.current(s.fileName, drop);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape" || !session.current) return;
    if (session.current.moved) swallowNextClick();
    finish();
  }

  // A drag ends in a click on the pad. Swallow it, but only briefly, so a later real click still works.
  function swallowNextClick() {
    const block = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("click", block, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", block, { capture: true }), 50);
  }

  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, fileName: string) => {
      if (e.button !== 0 || session.current) return;
      if ((e.target as HTMLElement).closest(".pad-row, .pad-forget")) return;
      const timer = window.setTimeout(() => {
        const s = session.current;
        if (s && !s.active) activate(s);
      }, HOLD_MS);
      session.current = {
        fileName,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
        moved: false,
        over: null,
        timer,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("keydown", onKey);
    },
    // Listeners read only refs and the stable setState, so they are safe to create once per start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Never leave listeners behind if the board unmounts mid-drag.
  useEffect(() => () => finish(), [finish]);

  return { view, startDrag };
}

function nearestScroller(el: Element | null): HTMLElement | null {
  for (let n = el as HTMLElement | null; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}
