import { MAX_TIMEOUT_MS, normalizeWait } from "./shared.utils";

export interface IntervalTask {
  cancel: () => void;
}

export function createInterval(task: () => void, waitMs: number, immediate = false): IntervalTask {
  const wait = Math.min(Math.max(0, normalizeWait(waitMs)), MAX_TIMEOUT_MS);
  if (immediate) task();
  const id = setInterval(task, wait);
  return { cancel: () => clearInterval(id) };
}

export interface AnimationLoopTask {
  cancel: () => void;
}

export function createAnimationLoop(step: (now: number) => void): AnimationLoopTask {
  let frame = 0;
  let cancelled = false;
  const tick = (now: number): void => {
    if (cancelled) return;
    step(now);
    if (!cancelled) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
}
