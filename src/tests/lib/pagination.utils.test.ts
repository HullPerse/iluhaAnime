import { describe, expect, it } from "vitest";

import { paginate } from "@/lib/pagination.utils";

const items = [1, 2, 3, 4, 5, 6, 7];

describe("paginate", () => {
  it("returns the requested page slice", () => {
    expect(paginate(items, 1, 3)).toEqual([1, 2, 3]);
    expect(paginate(items, 2, 3)).toEqual([4, 5, 6]);
    expect(paginate(items, 3, 3)).toEqual([7]);
  });

  it("returns an empty array past the last page", () => {
    expect(paginate(items, 99, 3)).toEqual([]);
  });

  it("clamps page numbers below one", () => {
    expect(paginate(items, 0, 3)).toEqual([1, 2, 3]);
    expect(paginate(items, -5, 3)).toEqual([1, 2, 3]);
  });

  it("clamps page sizes below one", () => {
    expect(paginate(items, 1, 0)).toEqual([1]);
    expect(paginate(items, 1, -2)).toEqual([1]);
  });

  it("handles empty collections", () => {
    expect(paginate([], 1, 10)).toEqual([]);
  });
});
