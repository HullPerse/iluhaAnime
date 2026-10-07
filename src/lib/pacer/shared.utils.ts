import type { Cell } from "@/lib/state/signal.store";
import type { PacerEnabled, PacerMode, PacerWait } from "@/types/pacer";

export const MAX_TIMEOUT_MS = 2_147_483_647;

export function normalizeWait(wait: PacerWait): number {
  const raw = typeof wait === "function" ? wait() : wait;
  if (Number.isNaN(raw) || raw <= 0) return 0;
  if (!Number.isFinite(raw)) return MAX_TIMEOUT_MS;
  return Math.floor(raw);
}

export function normalizeMaxWait(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value) || value <= 0) return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.floor(value);
}

export function resolveEnabled(enabled: PacerEnabled | undefined): boolean {
  if (enabled === undefined) return true;
  return typeof enabled === "function" ? enabled() : enabled;
}

export interface ScheduledTask {
  cancel: () => void;
}

let nextSimpleCellId = 1;

export function createSimpleCell<T>(initial: T): Cell<T> {
  let value = initial;
  const subs = new Set<() => void>();
  const cell: Cell<T> = {
    id: nextSimpleCellId++,
    get: () => value,
    set: (next: T) => {
      if (Object.is(value, next)) return;
      value = next;
      for (const fn of subs) fn();
    },
    update: (fn: (prev: T) => T) => cell.set(fn(value)),
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
  return cell;
}

export function scheduleTask(mode: PacerMode, waitMs: number, run: () => void): ScheduledTask {
  const scheduler =
    mode === "raf" && typeof requestAnimationFrame === "function" ? "raf" : "timeout";
  if (scheduler === "timeout") {
    const id = setTimeout(run, Math.min(Math.max(0, waitMs), MAX_TIMEOUT_MS));
    return { cancel: () => clearTimeout(id) };
  }
  const start = Date.now();
  let frame = 0;
  let cancelled = false;
  const tick = (): void => {
    if (cancelled) return;
    if (Date.now() - start >= waitMs) {
      run();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
}
