import { describe, expect, it } from "vitest";

import { resolveResizeMultiplier } from "@/hooks/folderResize.hook";

describe("resolveResizeMultiplier", () => {
  it("means one step without a count", () => {
    expect(resolveResizeMultiplier("")).toBe(1);
  });

  it("reads the buffered count", () => {
    expect(resolveResizeMultiplier("3")).toBe(3);
  });

  it("falls back to one step on garbage", () => {
    expect(resolveResizeMultiplier("abc")).toBe(1);
    expect(resolveResizeMultiplier("0")).toBe(1);
  });
});
