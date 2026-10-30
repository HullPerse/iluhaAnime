import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAnimationLoop, createInterval } from "@/lib/core/interval.utils";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createInterval", () => {
  it("runs the task on every tick", () => {
    const task = vi.fn();
    const handle = createInterval(task, 1000);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(task).toHaveBeenCalledTimes(3);
    handle.cancel();
  });

  it("runs once upfront when immediate is set", () => {
    const task = vi.fn();
    const handle = createInterval(task, 1000, true);
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(2);
    handle.cancel();
  });

  it("stops ticking after cancel", () => {
    const task = vi.fn();
    const handle = createInterval(task, 1000);
    vi.advanceTimersByTime(2000);
    handle.cancel();
    vi.advanceTimersByTime(5000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("clamps negative waits to zero", () => {
    const task = vi.fn();
    const spy = vi.spyOn(globalThis, "setInterval");
    const handle = createInterval(task, -50);
    expect(spy).toHaveBeenCalledWith(task, 0);
    handle.cancel();
    spy.mockRestore();
  });
});

describe("createAnimationLoop", () => {
  it("steps every frame until cancelled", () => {
    let frame = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (step: FrameRequestCallback): number => {
      frame += 1;
      callbacks.set(frame, step);
      return frame;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
      callbacks.delete(id);
    });
    try {
      const step = vi.fn();
      const loop = createAnimationLoop(step);
      expect(step).not.toHaveBeenCalled();
      callbacks.get(1)?.(0);
      expect(step).toHaveBeenCalledTimes(1);
      loop.cancel();
      callbacks.get(2)?.(16);
      expect(step).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
