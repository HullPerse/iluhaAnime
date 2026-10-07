import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Debouncer, debounce } from "@/lib/pacer/debounce.utils";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Debouncer", () => {
  it("executes once with the last args after a quiet period", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(100);
    pacer.maybeExecute("b");
    expect(task).not.toHaveBeenCalled();
    expect(pacer.status.get()).toMatchObject({ isPending: true, status: "pending" });
    vi.advanceTimersByTime(100);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("b");
    expect(pacer.status.get()).toMatchObject({
      executionCount: 1,
      isPending: false,
      status: "idle",
    });
  });

  it("executes on the leading edge without a trailing call when alone", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { leading: true, wait: 300 });
    pacer.maybeExecute("a");
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
    expect(pacer.status.get().status).toBe("idle");
  });

  it("follows a leading execution with the latest trailing call", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { leading: true, wait: 300 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(100);
    pacer.maybeExecute("b");
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith("b");
  });

  it("restarts the maxWait window after an idle leading execution", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { leading: true, maxWait: 500, wait: 300 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(1000);
    pacer.maybeExecute("b");
    expect(task).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    pacer.maybeExecute("c");
    expect(task).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledTimes(3);
    expect(task).toHaveBeenLastCalledWith("c");
  });

  it("closes a lone leading window silently on flush", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { leading: true, trailing: false, wait: 300 });
    pacer.maybeExecute("a");
    pacer.flush();
    expect(task).toHaveBeenCalledTimes(1);
    expect(pacer.status.get()).toMatchObject({ isPending: false, status: "idle" });
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cools down after a leading execution when trailing is off", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { leading: true, trailing: false, wait: 300 });
    pacer.maybeExecute("a");
    pacer.maybeExecute("b");
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
  });

  it("drops pending work on cancel", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    pacer.cancel();
    expect(pacer.status.get()).toMatchObject({ isPending: false, status: "idle" });
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
  });

  it("runs pending work immediately on flush", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    pacer.flush();
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("ignores flush without pending work", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: 300 });
    pacer.flush();
    expect(task).not.toHaveBeenCalled();
  });

  it("ignores calls while disabled and reports the disabled status", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { enabled: false, wait: 100 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(200);
    expect(task).not.toHaveBeenCalled();
    expect(pacer.status.get().status).toBe("disabled");
  });

  it("cancels pending work when disabled through setOptions", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    pacer.setOptions({ enabled: false });
    expect(pacer.status.get().status).toBe("disabled");
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
    pacer.setOptions({ enabled: true });
    expect(pacer.status.get().status).toBe("idle");
  });

  it("forces execution within maxWait during continuous input", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[number]>(task, { maxWait: 500, wait: 300 });
    pacer.maybeExecute(1);
    vi.advanceTimersByTime(100);
    pacer.maybeExecute(2);
    vi.advanceTimersByTime(100);
    pacer.maybeExecute(3);
    vi.advanceTimersByTime(100);
    pacer.maybeExecute(4);
    vi.advanceTimersByTime(100);
    pacer.maybeExecute(5);
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith(5);
    vi.advanceTimersByTime(100);
    pacer.maybeExecute(6);
    vi.advanceTimersByTime(300);
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith(6);
  });

  it("resolves function waits on every schedule", () => {
    let wait = 100;
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: () => wait });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(99);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
    wait = 500;
    pacer.maybeExecute("b");
    vi.advanceTimersByTime(499);
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("applies a new wait to the next schedule only", () => {
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { wait: 300 });
    pacer.maybeExecute("a");
    pacer.setOptions({ wait: 50 });
    vi.advanceTimersByTime(50);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(task).toHaveBeenCalledTimes(1);
    pacer.maybeExecute("b");
    vi.advanceTimersByTime(50);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("notifies onExecute and clears state on reset", () => {
    const task = vi.fn();
    const onExecute = vi.fn();
    const pacer = new Debouncer<[string]>(task, { onExecute, wait: 100 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(100);
    expect(onExecute).toHaveBeenCalledTimes(1);
    pacer.maybeExecute("b");
    pacer.reset();
    expect(pacer.status.get()).toMatchObject({ executionCount: 0, isPending: false, status: "idle" });
    vi.advanceTimersByTime(500);
    expect(task).toHaveBeenCalledTimes(1);
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
    const pacer = new Debouncer<[string]>(task, { mode: "raf", wait: 100 });
    pacer.maybeExecute("a");
    expect(task).not.toHaveBeenCalled();
    runFrames();
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    runFrames();
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
  });

  it("falls back to timeouts when animation frames are unavailable", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const task = vi.fn();
    const pacer = new Debouncer<[string]>(task, { mode: "raf", wait: 50 });
    pacer.maybeExecute("a");
    vi.advanceTimersByTime(50);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe("debounce", () => {
  it("returns a function that debounces trailing calls", () => {
    const task = vi.fn();
    const run = debounce<[string]>(task, { wait: 100 });
    run("a");
    run("b");
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("b");
  });
});
