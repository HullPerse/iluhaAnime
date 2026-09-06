import { describe, expect, it } from "vitest";

import { computeGroupProgress } from "@/lib/collection/importProgress.utils";

describe("computeGroupProgress", () => {
  it("splits processed across groups in batch order", () => {
    const groups = [
      { name: "Watching", count: 2 },
      { name: "Completed", count: 5 },
    ];
    expect(computeGroupProgress(groups, 4)).toEqual([2, 2]);
  });

  it("returns zeros before any progress", () => {
    const groups = [{ name: "Planning", count: 3 }];
    expect(computeGroupProgress(groups, 0)).toEqual([0]);
  });

  it("caps at group counts when processed overflows", () => {
    const groups = [
      { name: "A", count: 1 },
      { name: "B", count: 2 },
    ];
    expect(computeGroupProgress(groups, 99)).toEqual([1, 2]);
  });

  it("clamps negative processed to zeros", () => {
    const groups = [{ name: "A", count: 4 }];
    expect(computeGroupProgress(groups, -5)).toEqual([0]);
  });
});
