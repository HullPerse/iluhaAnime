import { describe, expect, it } from "vitest";

import { barLength, nearestIndex, ratioSegments } from "@/lib/geometry.utils";

describe("barLength", () => {
  it("scales a value against the maximum", () => {
    expect(barLength(50, 100, 200)).toBe(100);
    expect(barLength(0, 100, 200)).toBe(0);
    expect(barLength(100, 100, 200)).toBe(200);
  });

  it("clamps values above the maximum and drops negatives", () => {
    expect(barLength(150, 100, 200)).toBe(200);
    expect(barLength(-5, 100, 200)).toBe(0);
  });

  it("returns zero for an empty scale", () => {
    expect(barLength(5, 0, 200)).toBe(0);
    expect(barLength(5, 100, 0)).toBe(0);
  });
});

describe("ratioSegments", () => {
  it("fills the full length without gaps or overlaps", () => {
    const segments = ratioSegments([1, 1, 1], 100);
    expect(segments.map((segment) => segment.length)).toEqual([33, 34, 33]);
    expect(segments[0]).toEqual({ start: 0, length: 33 });
    expect(segments[1]).toEqual({ start: 33, length: 34 });
    expect(segments[2]).toEqual({ start: 67, length: 33 });
    expect(segments.reduce((sum, segment) => sum + segment.length, 0)).toBe(100);
  });

  it("ignores negative and non-finite values", () => {
    const segments = ratioSegments([3, -1, Number.NaN, 1], 80);
    expect(segments.map((segment) => segment.length)).toEqual([60, 0, 0, 20]);
    expect(segments.reduce((sum, segment) => sum + segment.length, 0)).toBe(80);
  });

  it("returns zero widths when every value is empty", () => {
    expect(ratioSegments([0, 0], 80)).toEqual([
      { start: 0, length: 0 },
      { start: 0, length: 0 },
    ]);
    expect(ratioSegments([1], 0)).toEqual([{ start: 0, length: 0 }]);
  });
});

describe("nearestIndex", () => {
  it("handles an empty or single-value list", () => {
    expect(nearestIndex([], 10)).toBe(-1);
    expect(nearestIndex([5], 100)).toBe(0);
  });

  it("picks the closest value including both edges", () => {
    const values = [10, 20, 30];
    expect(nearestIndex(values, 9)).toBe(0);
    expect(nearestIndex(values, 10)).toBe(0);
    expect(nearestIndex(values, 16)).toBe(1);
    expect(nearestIndex(values, 26)).toBe(2);
    expect(nearestIndex(values, 300)).toBe(2);
  });

  it("prefers the lower index on a tie", () => {
    expect(nearestIndex([0, 10], 5)).toBe(0);
    expect(nearestIndex([0, 10, 20], 10)).toBe(1);
  });

  it("matches a brute-force scan on a long list", () => {
    const values = Array.from({ length: 400 }, (_, index) => index * 3 + 0.5);
    for (const target of [0, 1, 42.5, 599, 1_000, 1_198]) {
      const best = values.reduce(
        (winner, value, index) =>
          Math.abs(value - target) < Math.abs(values[winner]! - target) ? index : winner,
        0
      );
      expect(nearestIndex(values, target)).toBe(best);
    }
  });

  it("falls back to the first index for a non-finite target", () => {
    expect(nearestIndex([10, 20], Number.NaN)).toBe(0);
  });
});
