import { describe, expect, it } from "vitest";

import { formatVerticalDragTransform } from "@/lib/utils/drag.utils";

describe("formatVerticalDragTransform", () => {
  it("returns undefined without a transform", () => {
    expect(formatVerticalDragTransform(null)).toBeUndefined();
  });

  it("locks the transform to the vertical axis", () => {
    expect(formatVerticalDragTransform({ x: 120, y: 34 })).toBe("translate3d(0px, 34px, 0)");
    expect(formatVerticalDragTransform({ x: -45, y: -12 })).toBe("translate3d(0px, -12px, 0)");
  });
});
