import { describe, expect, it } from "vitest";

import { bucketRows } from "@/lib/core/collisionBroad.utils";

describe("bucketRows", () => {
  it("returns no bands for no tops", () => {
    expect(bucketRows([], 20)).toEqual([]);
  });

  it("groups tops within the gap into one band", () => {
    expect(bucketRows([10, 12, 40], 20)).toEqual([[0, 1], [2]]);
  });

  it("chains bands through intermediate steps", () => {
    expect(bucketRows([0, 19, 38], 20)).toEqual([[0, 1, 2]]);
  });

  it("sorts by top regardless of input order", () => {
    expect(bucketRows([40, 10, 12], 20)).toEqual([[1, 2], [0]]);
  });

  it("splits exactly at the gap", () => {
    expect(bucketRows([0, 20], 20)).toEqual([[0], [1]]);
  });
});
