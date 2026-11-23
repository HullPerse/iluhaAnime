import { useEffect } from "react";
import type { RefObject } from "react";

const READER_SCROLL_FADE_PX = 40;

function applyMask(scroller: HTMLElement): void {
  const range = scroller.scrollHeight - scroller.clientHeight;

  if (range <= 1) {
    scroller.style.removeProperty("mask-image");
    scroller.style.removeProperty("-webkit-mask-image");

    return;
  }

  const top = Math.min(READER_SCROLL_FADE_PX, Math.max(0, scroller.scrollTop));
  const bottom = Math.min(READER_SCROLL_FADE_PX, Math.max(0, range - scroller.scrollTop));
  const mask = `linear-gradient(to bottom, transparent, #000 ${top}px calc(100% - ${bottom}px), transparent)`;

  scroller.style.setProperty("mask-image", mask);
  scroller.style.setProperty("-webkit-mask-image", mask);
}

function clearMask(scroller: HTMLElement): void {
  scroller.style.removeProperty("mask-image");
  scroller.style.removeProperty("-webkit-mask-image");
}

export function useReaderScrollFade(
  ref: RefObject<HTMLDialogElement | null>,
  options: { enabled: boolean; ready: boolean }
) {
  const { enabled, ready } = options;
  useEffect(() => {
    if (!enabled || !ready) return;

    const root = ref.current;

    if (!root) return;

    const update = () => {
      const scroller = root.querySelector<HTMLElement>("[data-reader-scroll]");

      if (scroller) applyMask(scroller);
    };

    const onScroll = (event: Event) => {
      const target = event.target;

      if (target instanceof HTMLElement && target.matches("[data-reader-scroll]"))
        applyMask(target);
    };

    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const mutation =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(update);

    update();
    resize?.observe(root);
    mutation?.observe(root, { childList: true, subtree: true });
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", update);

    return () => {
      resize?.disconnect();
      mutation?.disconnect();
      root.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", update);
      const scroller = root.querySelector<HTMLElement>("[data-reader-scroll]");

      if (scroller) clearMask(scroller);
    };
  }, [ref, enabled, ready]);
}
