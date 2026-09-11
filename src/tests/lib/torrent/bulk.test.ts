import { describe, expect, it, vi } from "vitest";

import { applyBulkAction } from "@/lib/torrent/bulk.utils";

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
