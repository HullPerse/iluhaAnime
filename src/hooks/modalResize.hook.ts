import { useEffect } from "react";

export const MODAL_RESIZE_DURATION = 200;
const MODAL_RESIZE_EPSILON = 1;

interface BoxSize {
  width: number;
  height: number;
}

function measure(element: HTMLElement): BoxSize {
  return { width: element.offsetWidth, height: element.offsetHeight };
}

function sameSize(a: BoxSize, b: BoxSize): boolean {
  return (
    Math.abs(a.width - b.width) < MODAL_RESIZE_EPSILON &&
    Math.abs(a.height - b.height) < MODAL_RESIZE_EPSILON
  );
}

function viewportSize(): BoxSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
}

function clearSize(element: HTMLElement): void {
  element.style.width = "";
  element.style.height = "";
}

export function useModalResize(element: HTMLElement | null, enabled: boolean): void {
  useEffect(() => {
    if (!element || !enabled) return;
    if (typeof ResizeObserver === "undefined" || typeof requestAnimationFrame !== "function") {
      return;
    }

    let previous = measure(element);
    let viewport = viewportSize();
    let frame: number | null = null;
    let clipped = false;

    const releaseClip = () => {
      if (!clipped) return;
      clipped = false;
      element.style.overflow = "";
    };

    const stop = () => {
      if (frame === null) return;
      cancelAnimationFrame(frame);
      frame = null;
      clearSize(element);
      releaseClip();
      previous = measure(element);
    };

    const animateTo = (from: BoxSize, to: BoxSize) => {
      previous = to;
      if (!clipped) {
        clipped = true;
        element.style.overflow = "hidden";
      }
      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / MODAL_RESIZE_DURATION);
        const eased = easeInOut(progress);
        element.style.width = `${from.width + (to.width - from.width) * eased}px`;
        element.style.height = `${from.height + (to.height - from.height) * eased}px`;
        if (progress < 1) {
          frame = requestAnimationFrame(step);
          return;
        }
        frame = null;
        clearSize(element);
        const settled = measure(element);
        if (!sameSize(to, settled)) {
          animateTo(to, settled);
          return;
        }
        previous = settled;
        releaseClip();
      };
      frame = requestAnimationFrame(step);
    };

    const observer = new ResizeObserver(() => {
      const next = measure(element);
      const nextViewport = viewportSize();
      const viewportMoved =
        nextViewport.width !== viewport.width || nextViewport.height !== viewport.height;
      viewport = nextViewport;

      if (viewportMoved) {
        stop();
        previous = next;
        return;
      }

      if (frame !== null) return;
      if (sameSize(previous, next)) {
        previous = next;
        return;
      }
      animateTo(previous, next);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      stop();
    };
  }, [element, enabled]);
}
