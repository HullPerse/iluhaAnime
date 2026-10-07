import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Throttler, throttle } from "@/lib/pacer/throttle.utils";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Throttler", () => {
  it("executes on the leading edge and coalesces the rest into one trailing call", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
    pacer.maybeExecute("b");
    pacer.maybeExecute("c");
    expect(task).toHaveBeenCalledTimes(1);
    expect(pacer.store.state).toMatchObject({ isPending: true, status: "pending" });
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith("c");
    expect(pacer.store.state).toMatchObject({
      executionCount: 2,
      isPending: false,
      status: "idle",
    });
  });

  it("leads again once the window elapses", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(400);
    pacer.maybeExecute("b");
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith("b");
  });

  it("defers the first call when leading is off", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { leading: false, wait: 300 });
    pacer.maybeExecute("a");
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
  });

  it("drops mid-window calls when trailing is off", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { trailing: false, wait: 300 });
    pacer.maybeExecute("a");
    pacer.maybeExecute("b");
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
  });

  it("runs pending work immediately on flush", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { leading: false, wait: 300 });
    pacer.maybeExecute("a");
    pacer.flush();
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("drops pending work on cancel", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { leading: false, wait: 300 });
    pacer.maybeExecute("a");
    pacer.cancel();
    expect(pacer.store.state).toMatchObject({ isPending: false, status: "idle" });
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
  });

  it("ignores flush without pending work", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { wait: 100 });
    pacer.flush();
    expect(task).not.toHaveBeenCalled();
  });

  it("ignores calls while disabled and reports the disabled status", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { enabled: false, wait: 100 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(200);
    expect(task).not.toHaveBeenCalled();
    expect(pacer.store.state.status).toBe("disabled");
  });

  it("cancels pending work when disabled through setOptions", () => {
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { leading: false, wait: 300 });
    pacer.maybeExecute("a");
    pacer.setOptions({ enabled: false });
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
    pacer.setOptions({ enabled: true });
    expect(pacer.store.state.status).toBe("idle");
  });

  it("resets the count and the execution window", () => {
    const task = vi.fn();
    const onExecute = vi.fn();
    const pacer = new Throttler<[string]>(task, { onExecute, wait: 300 });
    pacer.maybeExecute("a");
    expect(onExecute).toHaveBeenCalledTimes(1);
    pacer.reset();
    vi.advanceTimersByTime(100);
    pacer.maybeExecute("b");
    expect(task).toHaveBeenCalledTimes(2);
    expect(pacer.store.state.executionCount).toBe(1);
  });

  it("resolves function waits on every schedule", () => {
    let wait = 300;
    const task = vi.fn();
    const pacer = new Throttler<[string]>(task, { wait: () => wait });
    pacer.maybeExecute("a");
    wait = 100;
    vi.advanceTimersByTime(400);
    pacer.maybeExecute("b");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("schedules trailing work on animation frames in raf mode", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
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
    const pacer = new Throttler<[string]>(task, { leading: false, mode: "raf", wait: 0 });
    pacer.maybeExecute("a");
    expect(task).not.toHaveBeenCalled();
    runFrames();
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
  });
});

describe("throttle", () => {
  it("returns a function that leads and then throttles", () => {
    const task = vi.fn();
    const run = throttle<[string]>(task, { wait: 200 });
    run("a");
    expect(task).toHaveBeenCalledTimes(1);
    run("b");
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith("b");
  });
});
