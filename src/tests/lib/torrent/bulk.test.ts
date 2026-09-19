import { describe, expect, it, vi } from "vitest";

import { applyBulkAction, splitRecheckOutcome } from "@/lib/torrent/bulk.utils";
import type { TorrentCheckResult } from "@/types/torrent";

function check(missing: number): TorrentCheckResult {
  return {
    id: 1,
    missing: Array.from({ length: missing }, (_, index) => `file-${index}`),
    size_mismatch: [],
    ok: 1,
    total: 1,
  };
}

describe("applyBulkAction", () => {
  it("counts every success", async () => {
    const act = vi.fn().mockResolvedValue(undefined);
    expect(await applyBulkAction([1, 2, 3], act)).toEqual({ done: 3, failed: 0 });
    expect(act).toHaveBeenCalledTimes(3);
  });

  it("counts partial failures without stopping", async () => {
    const act = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce(undefined);
    expect(await applyBulkAction([1, 2, 3], act)).toEqual({ done: 2, failed: 1 });
  });

  it("handles an empty selection", async () => {
    const act = vi.fn();
    expect(await applyBulkAction([], act)).toEqual({ done: 0, failed: 0 });
    expect(act).not.toHaveBeenCalled();
  });
});

describe("splitRecheckOutcome", () => {
  it("offers nothing for recreation when the check found the files", () => {
    expect(splitRecheckOutcome([1, 2], [check(0), check(0)])).toEqual({ lost: [], failed: 0 });
  });

  it("picks only the torrents that are still incomplete", () => {
    expect(splitRecheckOutcome([1, 2, 3], [check(0), check(2), check(0)])).toEqual({
      lost: [2],
      failed: 0,
    });
  });

  it("treats a failed check as a failure, never as a reason to recreate", () => {
    expect(splitRecheckOutcome([1, 2], [null, check(0)])).toEqual({ lost: [], failed: 1 });
  });

  it("ignores a missing result instead of reading it as clean", () => {
    expect(splitRecheckOutcome([1], [])).toEqual({ lost: [], failed: 1 });
  });
});
