import { describe, expect, it } from "vitest";

import { createSignalStore } from "@/lib/state/signal.store";

describe("cell get/set", () => {
  it.each([
    { initial: 0, next: 42 },
    { initial: "", next: "hello" },
    { initial: false, next: true },
  ])("roundtrips $next", ({ initial, next }) => {
    const store = createSignalStore();
    const cell = store.cell(initial);
    expect(cell.get()).toBe(initial);
    cell.set(next);
    expect(cell.get()).toBe(next);
  });

  it("stores object identity without cloning", () => {
    const store = createSignalStore();
    const value = { nested: [1, 2] };
    const cell = store.cell(value);
    expect(cell.get()).toBe(value);
  });

  it("applies update() from the previous value", () => {
    const store = createSignalStore();
    const cell = store.cell(2);
    cell.update((prev) => prev * 10);
    expect(cell.get()).toBe(20);
  });
});

describe("subscriptions", () => {
  it("notifies subscribers after set", () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    const seen: number[] = [];
    cell.subscribe(() => {
      seen.push(cell.get());
    });
    cell.set(1);
    cell.set(2);
    expect(seen).toEqual([1, 2]);
  });

  it("stays silent on same-value sets", () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    let calls = 0;
    cell.subscribe(() => {
      calls++;
    });
    cell.set(0);
    cell.set(0);
    expect(calls).toBe(0);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    let calls = 0;
    const unsub = cell.subscribe(() => {
      calls++;
    });
    cell.set(1);
    unsub();
    cell.set(2);
    expect(calls).toBe(1);
  });

  it("does not wake subscribers of unrelated atoms", () => {
    const store = createSignalStore();
    const first = store.atom("a", 0);
    const second = store.atom("b", 0);
    let calls = 0;
    first.subscribe(() => {
      calls++;
    });
    second.set(1);
    second.set(2);
    expect(calls).toBe(0);
    first.set(1);
    expect(calls).toBe(1);
  });
});

describe("atoms and snapshots", () => {
  it("returns the same handle for the same key", () => {
    const store = createSignalStore();
    expect(store.atom("k", 1)).toBe(store.atom("k", 999));
    expect(store.atom("k", 1).get()).toBe(1);
  });

  it("materializes every atom in snapshot()", () => {
    const store = createSignalStore();
    store.atom("n", 7);
    store.atom("s", "x");
    expect(store.snapshot()).toEqual({ n: 7, s: "x" });
  });
});

describe("derived", () => {
  it("stays cold until read or subscribed", () => {
    const store = createSignalStore();
    const source = store.cell(1);
    let computes = 0;
    const doubled = store.derive([source], (args) => {
      computes++;
      return (args[0] as number) * 2;
    });
    source.set(2);
    source.set(3);
    expect(computes).toBe(0);
    expect(doubled.get()).toBe(6);
    expect(computes).toBe(1);
  });

  it("caches the value while dependencies are unchanged", () => {
    const store = createSignalStore();
    const source = store.cell(1);
    let computes = 0;
    const doubled = store.derive([source], (args) => {
      computes++;
      return (args[0] as number) * 2;
    });
    expect(doubled.get()).toBe(2);
    expect(doubled.get()).toBe(2);
    expect(computes).toBe(1);
  });

  it("recomputes a diamond dependent exactly once per parent change", () => {
    const store = createSignalStore();
    const root = store.cell(1);
    const left = store.derive([root], (args) => (args[0] as number) * 2);
    const right = store.derive([root], (args) => (args[0] as number) * 3);
    let computes = 0;
    const bottom = store.derive([left, right], (args) => {
      computes++;
      return (args[0] as number) + (args[1] as number);
    });
    const seen: number[] = [];
    bottom.subscribe(() => {
      seen.push(bottom.get());
    });
    root.set(2);
    root.set(3);
    expect(computes).toBe(2);
    expect(seen).toEqual([10, 15]);
  });

  it("notifies the first computation, then stays silent on unchanged values", () => {
    const store = createSignalStore();
    const source = store.cell(1);
    const parity = store.derive([source], (args) => (args[0] as number) % 2);
    let calls = 0;
    parity.subscribe(() => {
      calls++;
    });
    source.set(3);
    expect(calls).toBe(1);
    source.set(5);
    source.set(7);
    expect(parity.get()).toBe(1);
    expect(calls).toBe(1);
  });

  it("rejects dependencies from another store", () => {
    const first = createSignalStore();
    const second = createSignalStore();
    const foreign = first.cell(1);
    expect(() => second.derive([foreign], (args) => args[0])).toThrow(
      "derive: dependency belongs to another store"
    );
  });

  it("throws a stable error on dependency cycles", () => {
    const store = createSignalStore();
    const source = store.cell(0);
    const loop = store.derive([source], () => {
      source.set(1);
      return 1;
    });
    loop.subscribe(() => undefined);
    expect(() => loop.get()).toThrow("signal cycle detected");
  });
});

describe("subscribeAll", () => {
  it("notifies once per flush that changed anything", () => {
    const store = createSignalStore();
    const a = store.cell(0);
    const b = store.cell(0);
    let calls = 0;
    store.subscribeAll(() => {
      calls++;
    });
    a.set(1);
    expect(calls).toBe(1);
    store.batch(() => {
      a.set(2);
      b.set(3);
    });
    expect(calls).toBe(2);
  });

  it("stays silent on no-op sets", () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    let calls = 0;
    store.subscribeAll(() => {
      calls++;
    });
    cell.set(0);
    expect(calls).toBe(0);
  });
});
describe("batch", () => {
  it("delivers one notification per subscriber for a batch", () => {
    const store = createSignalStore();
    const a = store.cell(0);
    const b = store.cell(0);
    const sum = store.derive([a, b], (args) => (args[0] as number) + (args[1] as number));
    const seen: number[] = [];
    sum.subscribe(() => {
      seen.push(sum.get());
    });
    store.batch(() => {
      a.set(1);
      b.set(2);
    });
    expect(seen).toEqual([3]);
  });

  it("supports nested batches with a single flush", () => {
    const store = createSignalStore();
    const cell = store.cell(0);
    let calls = 0;
    cell.subscribe(() => {
      calls++;
    });
    store.batch(() => {
      cell.set(1);
      store.batch(() => cell.set(2));
    });
    expect(cell.get()).toBe(2);
    expect(calls).toBe(1);
  });
});
