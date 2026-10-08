import { describe, expect, it, vi } from "vitest";

import { createJobRunner } from "@/lib/workers/job.utils";

class FakeWorker {
  listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  posted: unknown[] = [];
  terminated = false;

  postMessage(data: unknown): void {
    this.posted.push(data);
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: { data?: unknown }) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) listener({ data });
  }

  emitError(): void {
    for (const listener of this.listeners.get("error") ?? []) listener({});
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const onResult = vi.fn();
  const onError = vi.fn();
  const runner = createJobRunner<string, number>({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    onResult,
    onError,
    runSync: (payload) => payload.length,
  });
  return { workers, onResult, onError, runner };
}

describe("createJobRunner", () => {
  it("assigns incrementing ids and forwards the latest result", () => {
    const { workers, onResult, runner } = setup();
    runner.run("ab");
    runner.run("abcd");
    expect(workers[0]?.posted).toEqual([
      { id: 1, payload: "ab" },
      { id: 2, payload: "abcd" },
    ]);
    workers[0]?.emitMessage({ id: 2, ok: true, result: 4 });
    expect(onResult).toHaveBeenCalledWith(4);
  });

  it("drops stale responses", () => {
    const { workers, onResult, runner } = setup();
    runner.run("ab");
    runner.run("abcd");
    workers[0]?.emitMessage({ id: 1, ok: true, result: 2 });
    expect(onResult).not.toHaveBeenCalled();
  });

  it("routes failed responses to onError", () => {
    const { workers, onResult, onError, runner } = setup();
    runner.run("ab");
    workers[0]?.emitMessage({ id: 1, ok: false, error: "boom" });
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("terminates and recreates the worker on error", () => {
    const { workers, onError, runner } = setup();
    runner.run("ab");
    workers[0]?.emitError();
    expect(workers[0]?.terminated).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    runner.run("abc");
    expect(workers.length).toBe(2);
    expect(workers[1]?.terminated).toBe(false);
  });

  it("falls back to runSync when creation throws", () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    const runner = createJobRunner<string, number>({
      createWorker: () => {
        throw new Error("no worker");
      },
      onResult,
      onError,
      runSync: (payload) => payload.length,
    });
    runner.run("abcd");
    expect(onResult).toHaveBeenCalledWith(4);
    expect(onError).not.toHaveBeenCalled();
  });

  it("dispose terminates and ignores further runs", () => {
    const { workers, onResult, runner } = setup();
    runner.run("ab");
    runner.dispose();
    expect(workers[0]?.terminated).toBe(true);
    runner.run("abcd");
    expect(workers[0]?.posted.length).toBe(1);
    expect(onResult).not.toHaveBeenCalled();
  });
});
