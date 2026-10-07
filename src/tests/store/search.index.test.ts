import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { addSearchQuery } from "@/store/search.store";

function upsertCalls(): Array<{ entries: Array<{ id: string }> }> {
  return mockInvoke.mock.calls
    .filter(([command]) => command === "upsert_unified_index")
    .map(([, args]) => args as { entries: Array<{ id: string }> });
}

async function flushMicrotasks(turns = 30): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
});

describe("unified index sync chain", () => {
  it("serializes overlapping syncs: the second upsert waits for the first", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let upserts = 0;
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "upsert_unified_index") {
        upserts += 1;
        if (upserts === 1) return firstGate;
      }
      return Promise.resolve(undefined);
    });

    addSearchQuery("frieren beyond journey");
    addSearchQuery("naruto shippuden");
    await flushMicrotasks();

    // the second batch must not even start while the first invoke is pending:
    // with a per-call chain both would already be in flight.
    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls().at(0)?.entries.at(0)?.id).toContain("frieren beyond journey");

    releaseFirst();
    await flushMicrotasks();

    expect(upsertCalls()).toHaveLength(2);
    expect(upsertCalls().at(1)?.entries.at(0)?.id).toContain("naruto shippuden");
  });

  it("keeps serving later syncs after a failed batch", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("database is locked"));
    addSearchQuery("first query");
    await flushMicrotasks();
    mockInvoke.mockResolvedValue(undefined);
    addSearchQuery("second query");
    await flushMicrotasks();

    const calls = upsertCalls();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.at(-1)?.entries.at(0)?.id).toContain("second query");
  });
});
