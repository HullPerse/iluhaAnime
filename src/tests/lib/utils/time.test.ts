import { describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { formatClock, formatElapsed, formatETA } from "@/lib/utils/time.utils";

const ru = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("ru", key, vars);

const en = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("en", key, vars);

describe("formatClock", () => {
  it("returns 0:00 for invalid or negative input", () => {
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(Infinity)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("formats seconds and minutes without hour padding", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(125)).toBe("2:05");
  });

  it("formats hours with padded minutes and seconds", () => {
    expect(formatClock(3723)).toBe("1:02:03");
  });
});

describe("formatETA", () => {
  it("returns empty for null or invalid by default", () => {
    expect(formatETA(null, ru)).toBe("");
    expect(formatETA(0, ru)).toBe("");
    expect(formatETA(Infinity, ru)).toBe("");
  });

  it("returns the short label for zero values in minute mode", () => {
    expect(formatETA(0, ru, "minute")).toBe("< 1 мин");
    expect(formatETA(null, ru, "minute")).toBe("< 1 мин");
    expect(formatETA(Number.NaN, ru, "minute")).toBe("< 1 мин");
  });

  it("formats seconds", () => {
    expect(formatETA(45, ru)).toBe("45 сек");
  });

  it("formats minutes and seconds", () => {
    expect(formatETA(125, ru)).toBe("2 мин 5 сек");
    expect(formatETA(90, ru, "minute")).toBe("1 мин 30 сек");
  });

  it("formats hours and minutes", () => {
    expect(formatETA(3661, ru)).toBe("1 ч 1 мин");
  });

  it("formats seconds in English", () => {
    expect(formatETA(45, en)).toBe("45 sec");
    expect(formatETA(125, en)).toBe("2 min 5 sec");
    expect(formatETA(3661, en)).toBe("1 h 1 min");
  });

  it("rounds sub-minute fractions up to whole seconds", () => {
    expect(formatETA(59.6, ru)).toBe("60 сек");
  });

  it("formats the exact hour boundary", () => {
    expect(formatETA(3600, ru)).toBe("1 ч 0 мин");
  });

  it("treats negative input as zero", () => {
    expect(formatETA(-5, ru)).toBe("");
    expect(formatETA(-5, ru, "minute")).toBe("< 1 мин");
  });
  });


describe("formatElapsed", () => {
  it("formats seconds only", () => {
    expect(formatElapsed(45, ru)).toBe("45 сек");
  });

  it("formats whole minutes", () => {
    expect(formatElapsed(120, ru)).toBe("2 мин");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(125, ru)).toBe("2 мин 5 сек");
  });

  it("clamps invalid or negative input to zero", () => {
    expect(formatElapsed(Number.NaN, ru)).toBe("0 сек");
    expect(formatElapsed(-5, ru)).toBe("0 сек");
    expect(formatElapsed(0, ru)).toBe("0 сек");
  });

  it("formats in English", () => {
    expect(formatElapsed(45, en)).toBe("45 sec");
    expect(formatElapsed(125, en)).toBe("2 min 5 sec");
  });
});
