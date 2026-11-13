import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useThrottledCallback } from "@/hooks/pacer.hook";

function resetTilt(target: HTMLElement): void {
  target.style.setProperty("--cards-tilt-x", "0deg");
  target.style.setProperty("--cards-tilt-y", "0deg");
  target.style.setProperty("--cards-tilt-shift-x", "50%");
  target.style.setProperty("--cards-tilt-shift-y", "50%");
}

export function useCardTilt(enabled: boolean) {
  const activeCard = useRef<HTMLElement | null>(null);

  const move = useThrottledCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-card-face]");
      if (target === null) {
        if (activeCard.current !== null) {
          resetTilt(activeCard.current);
          activeCard.current = null;
        }
        return;
      }
      if (activeCard.current !== target) {
        if (activeCard.current !== null) resetTilt(activeCard.current);
        activeCard.current = target;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const mode = target.dataset.tilt;
      const maxX = mode === "full" ? 8 : mode === "back" ? 2.2 : 3;
      const maxY = mode === "full" ? 12 : mode === "back" ? 3.2 : 5;
      target.style.setProperty("--cards-tilt-x", `${(-y * maxX).toFixed(1)}deg`);
      target.style.setProperty("--cards-tilt-y", `${(x * maxY).toFixed(1)}deg`);
      target.style.setProperty("--cards-tilt-shift-x", `${(35 + (x + 0.5) * 30).toFixed(1)}%`);
      target.style.setProperty("--cards-tilt-shift-y", `${(35 + (y + 0.5) * 30).toFixed(1)}%`);
    },
    { wait: 16 }
  );

  const leave = (event: ReactPointerEvent<HTMLElement>) => {
    // A throttled trailing move would otherwise re-apply the last tilt after
    // the pointer is already gone, which leaves the card stuck rotated.
    move.cancel();
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-card-face]");
    if (target !== null) {
      resetTilt(target);
      if (activeCard.current === target) activeCard.current = null;
      return;
    }
    event.currentTarget
      .querySelectorAll<HTMLElement>("[data-card-face]")
      .forEach(resetTilt);
    activeCard.current = null;
  };

  return { onPointerLeave: leave, onPointerMove: move };
}
