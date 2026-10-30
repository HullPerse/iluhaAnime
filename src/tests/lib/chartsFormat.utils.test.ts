import { describe, expect, it } from "vitest";

import { formatCompact, formatPercent } from "@/lib/chartsFormat.utils";

describe("formatCompact", () => {
  it("keeps small numbers readable", () => {
    expect(formatCompact(0, "en")).toBe("0");
    expect(formatCompact(999, "en")).toBe("999");
  });

  it("uses compact suffixes above a thousand", () => {
    expect(formatCompact(1_200, "en")).toBe("1.2K");
    expect(formatCompact(3_400_000, "en")).toBe("3.4M");
    expect(formatCompact(1_200_000_000, "en")).toBe("1.2B");
    expect(formatCompact(-1_200, "en")).toBe("-1.2K");
  });

  it("follows the locale", () => {
    expect(formatCompact(1_200, "ru")).toMatch(/1,2\s*тыс/);
    expect(formatCompact(3_400_000, "ru")).toMatch(/3,4\s*млн/);
  });

  it("falls back to zero for non-finite input", () => {
    expect(formatCompact(Number.NaN, "en")).toBe("0");
    expect(formatCompact(Number.POSITIVE_INFINITY, "en")).toBe("0");
  });
});

describe("formatPercent", () => {
  it("renders whole percents", () => {
    expect(formatPercent(0.423, "en")).toBe("42%");
    expect(formatPercent(1, "en")).toBe("100%");
    expect(formatPercent(0, "en")).toBe("0%");
  });

  it("supports fractional digits and locale spacing", () => {
    expect(formatPercent(0.4234, "en", 1)).toBe("42.3%");
    expect(formatPercent(0.42, "ru")).toMatch(/42\s*%/);
  });

  it("falls back to zero percent for non-finite input", () => {
    expect(formatPercent(Number.NaN, "en")).toBe("0%");
  });
});
