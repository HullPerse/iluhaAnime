// oxlint-disable react-doctor/no-layout-property-animation -- the popup is content-sized, so a
// transform would scale its contents instead of reflowing them; width/height are the only way to
// animate a real window resize.
import { useEffect } from "react";

export const MODAL_RESIZE_DURATION = 200;
export const MODAL_RESIZE_EPSILON = 1;

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

/**
 * Animates the popup between its old and new content-driven size with the Web Animations API.
 *
 * A plain CSS transition cannot do this: the popup is `fit-content`, so the computed width and
 * height never change and no transition is triggered. A ResizeObserver reports the settled size,
 * then the box is animated from the previous one to the new one. Changes caused by a window resize
 * are applied instantly, and callbacks fired by the animation itself are ignored.
 *
 * Takes the element itself rather than a ref: Base UI mounts the portalled popup a few renders
 * after the modal, so an effect keyed on a stable ref object would run while `ref.current` is
 * still null and never attach the observer.
 */
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
      // A browser-side cancel (element unmounted, animation replaced) must not leave the hook
      // thinking a resize is still in flight, otherwise every later size change is ignored.
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
