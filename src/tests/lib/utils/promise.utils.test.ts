import { describe, expect, it } from "vitest";

import { createCoalescedRunner } from "@/lib/utils/promise.utils";

async function flushMicrotasks(turns = 20): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

describe("createCoalescedRunner", () => {
  it("runs the task immediately when idle and resolves after completion", async () => {
    const runner = createCoalescedRunner();
    const order: string[] = [];
    await runner(async () => {
      order.push("run");
    });
    expect(order).toEqual(["run"]);
  });

  it("coalesces overlapping calls into one trailing run with the latest task", async () => {
    const runner = createCoalescedRunner();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: string[] = [];

    const first = runner(async () => {
      await gate;
      seen.push("first");
    });
    const second = runner(async () => {
      seen.push("second");
    });
    const third = runner(async () => {
      seen.push("third");
    });
    await flushMicrotasks();
    // only the first task started; second was replaced by third
    expect(seen).toEqual([]);
    release();
    await Promise.all([first, second, third]);
    expect(seen).toEqual(["first", "third"]);
  });

  it("runs again after going idle", async () => {
    const runner = createCoalescedRunner();
    let runs = 0;
    await runner(async () => {
      runs += 1;
    });
    await runner(async () => {
      runs += 1;
    });
    expect(runs).toBe(2);
  });

  it("survives a rejected task and keeps serving later calls", async () => {
    const runner = createCoalescedRunner();
    const seen: string[] = [];
    await runner(async () => {
      seen.push("failing");
      throw new Error("boom");
    });
    await runner(async () => {
      seen.push("after");
    });
    expect(seen).toEqual(["failing", "after"]);
  });

  it("survives a synchronously throwing task", async () => {
    const runner = createCoalescedRunner();
    let runs = 0;
    await runner(() => {
      runs += 1;
      throw new Error("sync boom");
    });
    await runner(async () => {
      runs += 1;
    });
    expect(runs).toBe(2);
  });
});
