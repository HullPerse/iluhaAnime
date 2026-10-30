import { useEffect, useRef, useState } from "react";

import { createAnimationLoop } from "@/lib/core/interval.utils";

export function useTweenedValue(target: number, durationMs: number): number {
  const instant = durationMs <= 0 || !isFinite(target);
  const [tweened, setTweened] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (instant) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) {
      // Re-entering the animated mode after a jump: the last frame may lag.
      setTweened(from);
      return;
    }
    const startedAt = performance.now();
    const loop = createAnimationLoop((now) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const next = from + (target - from) * progress;
      fromRef.current = next;
      setTweened(next);
      if (progress >= 1) loop.cancel();
    });
    return () => loop.cancel();
  }, [target, durationMs, instant]);
  return instant ? target : tweened;
}
