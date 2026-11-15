import { describe, expect, it } from "vitest";

import { formatCompact, formatPercent } from "@/lib/graphics/chartsFormat.utils";

describe("formatCompact", () => {
  it("keeps small numbers readable", () => {
    expect(formatCompact(0, "ru")).toBe("0");
    expect(formatCompact(999, "ru")).toBe("999");
  });

  it("uses compact suffixes above a thousand", () => {
    expect(formatCompact(1_200, "ru")).toMatch(/^1,2\s*тыс\.?$/);
    expect(formatCompact(3_400_000, "ru")).toMatch(/^3,4\s*млн\.?$/);
    expect(formatCompact(1_200_000_000, "ru")).toMatch(/^1,2\s*млрд\.?$/);
    expect(formatCompact(-1_200, "ru")).toMatch(/^-1,2\s*тыс\.?$/);
  });

  it("follows the locale", () => {
    expect(formatCompact(1_200, "ru")).toMatch(/1,2\s*тыс/);
    expect(formatCompact(3_400_000, "ru")).toMatch(/3,4\s*млн/);
  });

  it("falls back to zero for non-finite input", () => {
    expect(formatCompact(Number.NaN, "ru")).toBe("0");
    expect(formatCompact(Number.POSITIVE_INFINITY, "ru")).toBe("0");
  });
});

describe("formatPercent", () => {
  it("renders whole percents", () => {
    expect(formatPercent(0.423, "ru")).toMatch(/^42\s*%$/);
    expect(formatPercent(1, "ru")).toMatch(/^100\s*%$/);
    expect(formatPercent(0, "ru")).toMatch(/^0\s*%$/);
  });

  it("supports fractional digits and locale spacing", () => {
    expect(formatPercent(0.4234, "ru", 1)).toMatch(/^42,3\s*%$/);
    expect(formatPercent(0.42, "ru")).toMatch(/42\s*%/);
  });

  it("falls back to zero percent for non-finite input", () => {
    expect(formatPercent(Number.NaN, "ru")).toMatch(/^0\s*%$/);
  });
});
