import { describe, expect, it } from "vitest";

import { bandScale, linearScale, niceMax, niceTicks, normalize } from "@/lib/core/scale.utils";

describe("normalize", () => {
  it("maps the domain onto zero and one", () => {
    expect(normalize(5, [0, 10])).toBe(0.5);
    expect(normalize(0, [0, 10])).toBe(0);
    expect(normalize(10, [0, 10])).toBe(1);
  });

  it("clamps outside the domain", () => {
    expect(normalize(-4, [0, 10])).toBe(0);
    expect(normalize(40, [0, 10])).toBe(1);
  });

  it("returns zero for a degenerate domain and for non-finite values", () => {
    expect(normalize(5, [5, 5])).toBe(0);
    expect(normalize(Number.NaN, [0, 10])).toBe(0);
  });
});

describe("linearScale", () => {
  it("maps values onto both range directions", () => {
    expect(linearScale([0, 10], [0, 100])(5)).toBe(50);
    expect(linearScale([0, 10], [100, 0])(5)).toBe(50);
    expect(linearScale([0, 10], [100, 0])(0)).toBe(100);
  });

  it("collapses a zero-span domain to the range start", () => {
    expect(linearScale([0, 0], [10, 20])(0)).toBe(10);
  });
});

describe("bandScale", () => {
  it("splits the length into bands and gaps", () => {
    const scale = bandScale(4, 100, 4);
    expect(scale.bandwidth).toBe(22);
    expect(scale.step).toBe(26);
    expect(scale.position(0)).toBe(0);
    expect(scale.position(3)).toBe(78);
    expect(scale.center(0)).toBe(11);
    expect(scale.center(3)).toBe(89);
  });

  it("returns zero geometry for empty input", () => {
    const empty = bandScale(0, 100, 4);
    expect(empty.bandwidth).toBe(0);
    expect(empty.position(2)).toBe(0);
    const noLength = bandScale(3, 0, 4);
    expect(noLength.bandwidth).toBe(0);
  });

  it("never produces a negative bandwidth when the gaps overflow", () => {
    const scale = bandScale(10, 20, 4);
    expect(scale.bandwidth).toBe(0);
    expect(scale.step).toBe(4);
  });
});

describe("niceTicks", () => {
  it("produces round ascending ticks inside the domain", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 286, 5)).toEqual([0, 100, 200]);
  });

  it("keeps fractional steps without float noise", () => {
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0, 0.4, 4)).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
  });

  it("handles negative domains and reversed bounds", () => {
    expect(niceTicks(-100, 100, 4)).toEqual([-100, -50, 0, 50, 100]);
    expect(niceTicks(100, -100, 4)).toEqual([-100, -50, 0, 50, 100]);
  });

  it("returns a single tick for a flat domain", () => {
    expect(niceTicks(7, 7)).toEqual([7]);
  });

  it("returns nothing for invalid input", () => {
    expect(niceTicks(0, 10, 0)).toEqual([]);
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
  });
});

describe("niceMax", () => {
  it("rounds up to a step multiple", () => {
    expect(niceMax(286)).toBe(300);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(0.9, 3)).toBe(1);
    expect(niceMax(0.4, 2)).toBe(0.4);
  });

  it("returns zero for empty or negative maxima", () => {
    expect(niceMax(0)).toBe(0);
    expect(niceMax(-5)).toBe(0);
  });
});
