import { describe, expect, it } from "vitest";

import { MASCOT_DIM_COVERAGE, overlapCoverage, shouldDimMascot } from "@/lib/search/mascot.utils";

const MASCOT = { left: 0, top: 400, right: 216, bottom: 616 };
const SQUARE = { left: 0, top: 0, right: 100, bottom: 100 };

describe("overlapCoverage", () => {
  it("measures the covered fraction of the mascot", () => {
    expect(overlapCoverage(SQUARE, { left: 50, top: 50, right: 300, bottom: 300 })).toBe(0.25);
  });

  it("counts a partial overlap", () => {
    expect(overlapCoverage(MASCOT, { left: 142, top: 300, right: 718, bottom: 460 })).toBeCloseTo(
      0.095,
      3
    );
  });

  it("counts containment as full coverage", () => {
    expect(overlapCoverage(MASCOT, { left: -50, top: 300, right: 500, bottom: 800 })).toBe(1);
  });

  it("ignores separated and edge-touching rects", () => {
    expect(overlapCoverage(MASCOT, { left: 900, top: 300, right: 1476, bottom: 460 })).toBe(0);
    expect(overlapCoverage(MASCOT, { left: 216, top: 400, right: 500, bottom: 616 })).toBe(0);
  });

  it("ignores zero-area rects", () => {
    expect(overlapCoverage({ left: 0, top: 0, right: 0, bottom: 0 }, SQUARE)).toBe(0);
  });
});

describe("shouldDimMascot", () => {
  it("dims once the panel covers a meaningful part of the mascot", () => {
    const panel = { left: 66, top: 466, right: 600, bottom: 800 };
    expect(overlapCoverage(MASCOT, panel)).toBeGreaterThan(MASCOT_DIM_COVERAGE);
    expect(shouldDimMascot(MASCOT, panel)).toBe(true);
  });

  it("ignores a panel that covers less than a fifth of the mascot", () => {
    const panel = { left: 0, top: 576, right: 600, bottom: 800 };
    expect(overlapCoverage(MASCOT, panel)).toBeGreaterThan(0.1);
    expect(shouldDimMascot(MASCOT, panel)).toBe(false);
  });

  it("ignores a panel that only grazes the mascot", () => {
    expect(shouldDimMascot(MASCOT, { left: 200, top: 556, right: 776, bottom: 800 })).toBe(false);
  });

  it("ignores a panel that is fully clear of the mascot", () => {
    expect(shouldDimMascot(MASCOT, { left: 900, top: 300, right: 1476, bottom: 460 })).toBe(false);
  });

  it("dims exactly at the threshold", () => {
    expect(overlapCoverage(SQUARE, { left: 0, top: 80, right: 300, bottom: 300 })).toBe(
      MASCOT_DIM_COVERAGE
    );
    expect(shouldDimMascot(SQUARE, { left: 0, top: 80, right: 300, bottom: 300 })).toBe(true);
  });
});
