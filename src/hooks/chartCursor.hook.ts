import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";

import { clamp } from "@/lib/math.utils";
import type { ChartCursor } from "@/types/chartCursor";

const FORWARD_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const BACKWARD_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export function useChartCursor(count: number, onActivate?: (index: number) => void): ChartCursor {
  const [rawActive, setRawActive] = useState<number | null>(null);
  const active = rawActive != null && rawActive >= 0 && rawActive < count ? rawActive : null;

  const handlePointerLeave = useCallback(() => setRawActive(null), []);

  const move = useCallback(
    (delta: number) => {
      if (count <= 0) return;
      setRawActive((current) => {
        const next = (current ?? (delta < 0 ? count : -1)) + delta;
        return clamp(next, 0, count - 1);
      });
    },
    [count]
  );

  const setActive = useCallback(
    (index: number | null) => {
      setRawActive(index == null ? null : clamp(index, 0, Math.max(0, count - 1)));
    },
    [count]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (count <= 0) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (FORWARD_KEYS.has(event.key)) {
        move(1);
      } else if (BACKWARD_KEYS.has(event.key)) {
        move(-1);
      } else if (event.key === "Home") {
        setRawActive(0);
      } else if (event.key === "End") {
        setRawActive(count - 1);
      } else if (event.key === "Enter") {
        if (active == null) return;
        onActivate?.(active);
      } else if (event.key === "Escape") {
        if (active == null) return;
        setRawActive(null);
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [active, count, move, onActivate]
  );

  const handleFocus = useCallback(() => {
    if (count > 0) setRawActive((current) => (current == null ? 0 : current));
  }, [count]);

  const handleBlur = useCallback(() => setRawActive(null), []);

  return { active, setActive, handlePointerLeave, handleKeyDown, handleFocus, handleBlur };
}
