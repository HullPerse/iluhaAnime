import { useEffect, useRef, useState } from "react";

import { useSettingsStore } from "@/store/settings.store";

const TWEEN_MS = 400;

function useTweenedValue(target: number, durationMs: number): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (durationMs <= 0 || !isFinite(target)) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const next = from + (target - from) * progress;
      fromRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return shown;
}

/** Formats a value that eases towards its target when the animated counters setting is on. */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}) {
  const animateCounters = useSettingsStore((s) => s.animateCounters);
  const shown = useTweenedValue(value, animateCounters ? TWEEN_MS : 0);
  return <>{format(shown)}</>;
}
