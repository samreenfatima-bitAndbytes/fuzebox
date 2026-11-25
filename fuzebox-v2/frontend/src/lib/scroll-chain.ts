import { useEffect, useRef } from "react";

const PAGE_SCROLL_SELECTOR = ".fb-shell-content";

function isScrollable(el: HTMLElement): boolean {
  const { overflowY } = window.getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay")
    return false;
  return el.scrollHeight > el.clientHeight + 2;
}

function forwardWheelNative(e: WheelEvent, root: HTMLElement) {
  const page = root.closest(PAGE_SCROLL_SELECTOR) as HTMLElement | null;
  if (!page || e.deltaY === 0) return;

  let el = e.target as HTMLElement | null;
  while (el && el !== page) {
    if (isScrollable(el)) {
      const atTop = el.scrollTop <= 0;
      const atBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
        return;
      }
      page.scrollTop += e.deltaY;
      e.preventDefault();
      return;
    }
    el = el.parentElement;
  }

  page.scrollTop += e.deltaY;
  e.preventDefault();
}

/**
 * Inner scroll first; when the list hits top/bottom, the same wheel gesture
 * scrolls `.fb-shell-content` (page). Attach ref to the overflow container.
 */
export function useShellScrollChain<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const boundary = ref.current;
    if (!boundary) return;

    const onWheel = (e: WheelEvent) => forwardWheelNative(e, boundary);
    boundary.addEventListener("wheel", onWheel, { passive: false });
    return () => boundary.removeEventListener("wheel", onWheel);
  }, []);

  return ref;
}
