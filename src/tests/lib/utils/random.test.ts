import { describe, expect, it } from "vitest";

import { hashStringToUint32, mulberry32 } from "@/lib/utils/random.utils";

describe("hashStringToUint32", () => {
  it("is stable and spreads inputs", () => {
    expect(hashStringToUint32("spotlight:day:2026-09-10")).toBe(
      hashStringToUint32("spotlight:day:2026-09-10")
    );
    expect(hashStringToUint32("a")).not.toBe(hashStringToUint32("b"));
    expect(hashStringToUint32("")).toBe(0x811c9dc5);
  });
});

describe("mulberry32", () => {
  it("replays the same sequence per seed", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("stays within [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
