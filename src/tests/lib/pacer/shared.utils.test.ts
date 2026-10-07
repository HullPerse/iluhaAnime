import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_TIMEOUT_MS, normalizeMaxWait, normalizeWait, resolveEnabled, scheduleTask } from "@/lib/pacer/shared.utils";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("normalizeWait", () => {
  it("passes plain millisecond values through", () => {
    expect(normalizeWait(300)).toBe(300);
  });

  it("floors fractional values", () => {
    expect(normalizeWait(12.7)).toBe(12);
  });

  it("clamps zero, negative, and NaN to zero", () => {
    expect(normalizeWait(0)).toBe(0);
    expect(normalizeWait(-5)).toBe(0);
    expect(normalizeWait(Number.NaN)).toBe(0);
  });

  it("clamps infinity to the maximum timer value", () => {
    expect(normalizeWait(Number.POSITIVE_INFINITY)).toBe(MAX_TIMEOUT_MS);
  });

  it("resolves function values on every call", () => {
    let wait = 250;
    const resolved = () => normalizeWait(() => wait);
    expect(resolved()).toBe(250);
    wait = -1;
    expect(resolved()).toBe(0);
  });
});

describe("normalizeMaxWait", () => {
  it("keeps positive finite values floored", () => {
    expect(normalizeMaxWait(500)).toBe(500);
    expect(normalizeMaxWait(499.9)).toBe(499);
  });

  it("drops missing, zero, negative, NaN, and infinite caps", () => {
    expect(normalizeMaxWait(undefined)).toBeUndefined();
    expect(normalizeMaxWait(0)).toBeUndefined();
    expect(normalizeMaxWait(-10)).toBeUndefined();
    expect(normalizeMaxWait(Number.NaN)).toBeUndefined();
    expect(normalizeMaxWait(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("resolveEnabled", () => {
  it("defaults to enabled", () => {
    expect(resolveEnabled(undefined)).toBe(true);
  });

  it("passes booleans through and resolves functions", () => {
    expect(resolveEnabled(true)).toBe(true);
    expect(resolveEnabled(false)).toBe(false);
    expect(resolveEnabled(() => true)).toBe(true);
    expect(resolveEnabled(() => false)).toBe(false);
  });
});

describe("scheduleTask", () => {
  it("fires timeout tasks after the wait", () => {
    const callback = vi.fn();
    scheduleTask("timeout", 100, callback);
    vi.advanceTimersByTime(99);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancels animation frame tasks", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      frames.set(id, frame);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    const runFrames = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const frame of callbacks) frame(0);
    };
    const task = vi.fn();
    const scheduled = scheduleTask("raf", 100, task);
    scheduled.cancel();
    runFrames();
    vi.advanceTimersByTime(1000);
    runFrames();
    expect(task).not.toHaveBeenCalled();
  });
});
