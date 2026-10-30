import type { ScrollDirection } from "@/types/ui/scroll";

const NO_WHEEL_SELECTOR = "[data-no-wheel]";
const PLAYLIST_SCROLL_SELECTOR = "[data-playlist-scroll]";

export function closestScrollable(element: Element | null): HTMLElement | null {
  let node: HTMLElement | null = element instanceof HTMLElement ? element : null;
  while (node && node !== document.body) {
    if (!node.matches(NO_WHEEL_SELECTOR)) {
      if (node.matches(PLAYLIST_SCROLL_SELECTOR)) return node;
      if (node.scrollHeight > node.clientHeight + 1) return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function isInsideScrollable(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return closestScrollable(element) !== null;
}

export function scrollAmount(
  direction: ScrollDirection,
  clientHeight: number,
  linePx: number
): number {
  const half = direction === "half.down" || direction === "half.up";
  const step = half ? Math.max(linePx, clientHeight / 2) : linePx;
  return direction === "up" || direction === "half.up" ? -step : step;
}
