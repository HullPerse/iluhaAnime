import { useEffect, useRef, useState } from "react";

const DURATION_SETTLE_MS = 250;

/**
 * Timeline duration with a short settle when metadata and mpv disagree enough
 * to bypass the hint tolerance. Seek bounds still use the authoritative value;
 * this only keeps the visible bar from snapping to a new width in one frame.
 */
export function useDisplayDuration(liveDuration: number, durationHint: number): number {
  const target = liveDuration > 0 ? liveDuration : durationHint;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    const from = displayRef.current;
    if (target <= 0 || from <= 0 || Math.abs(target - from) < 0.05) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_SETTLE_MS);
      const value = from + (target - from) * progress;
      displayRef.current = value;
      setDisplay(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return display;
}
