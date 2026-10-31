// oxlint-disable react-doctor/no-layout-property-animation -- the popup is content-sized, so a
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

export function useModalResize(element: HTMLElement | null, enabled: boolean): void {
  useEffect(() => {
    if (!element || !enabled) return;
    if (typeof ResizeObserver === "undefined" || typeof element.animate !== "function") return;

    let previous = measure(element);
    let viewport = viewportSize();
    let animation: Animation | null = null;
    let clipped = false;

    const releaseClip = () => {
      if (!clipped) return;
      clipped = false;
      element.style.overflow = "";
    };

    const stop = () => {
      if (!animation) return;
      const running = animation;
      animation = null;
      running.cancel();
      releaseClip();
      previous = measure(element);
    };

    const animateTo = (from: BoxSize, to: BoxSize) => {
      previous = to;
      if (!clipped) {
        clipped = true;
        element.style.overflow = "hidden";
      }
      const running = element.animate(
        [
          { width: `${from.width}px`, height: `${from.height}px` },
          { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: MODAL_RESIZE_DURATION, easing: "ease-in-out" }
      );
      animation = running;
      running.addEventListener("finish", () => {
        if (animation !== running) return;
        animation = null;
        const settled = measure(element);
        if (!sameSize(to, settled)) {
          animateTo(to, settled);
          return;
        }
        previous = settled;
        releaseClip();
      });
      running.addEventListener("cancel", () => {
        if (animation !== running) return;
        animation = null;
        releaseClip();
        previous = measure(element);
      });
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

      if (animation) return;
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
