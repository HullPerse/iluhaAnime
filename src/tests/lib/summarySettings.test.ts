import { describe, expect, it } from "vitest";

import { cacheRate } from "@/lib/ui/summarySettings.utils";

describe("cacheRate", () => {
  it("reports the hit share as a whole percent", () => {
    expect(cacheRate({ hits: 3, misses: 1 })).toBe(75);
    expect(cacheRate({ hits: 1, misses: 2 })).toBe(33);
  });

  it("does not divide by zero on a fresh cache", () => {
    expect(cacheRate({ hits: 0, misses: 0 })).toBe(0);
  });

  it("handles a full-hit cache", () => {
    expect(cacheRate({ hits: 12, misses: 0 })).toBe(100);
  });
});
