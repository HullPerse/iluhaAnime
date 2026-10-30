import { useEffect, useState } from "react";
import type { RefObject } from "react";

import { GAME_DISPLAY } from "@/config/player/display.config";

/**
 * Fits the stage with whole-pixel canvas scale so the framebuffer is never
 * resampled. Recomputed only on size changes; jsdom without ResizeObserver
 * keeps the minimum scale.
 */
export function useIntegerScale(
  stage: RefObject<HTMLElement | null>,
  cols: number,
  rows: number
): number {
  const [scale, setScale] = useState<number>(GAME_DISPLAY.minScale);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;

    const measure = (): void => {
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (width <= 0 || height <= 0) return;
      const fit = Math.floor(Math.min(width / cols, height / rows));
      const next = Math.min(Math.max(fit, GAME_DISPLAY.minScale), GAME_DISPLAY.maxScale);
      setScale((current) => (current === next ? current : next));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage, cols, rows]);

  return scale;
}
