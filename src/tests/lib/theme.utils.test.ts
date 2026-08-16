import { describe, expect, it } from "vitest";

import { generateFromAccent } from "@/lib/theme.utils";

describe("generateFromAccent", () => {
  it("generates a full light palette", () => {
    const colors = generateFromAccent("#ff6b35", "#ffffff");
    expect(colors.background).toBe("#ffffff");
    expect(colors.text).toBe("#000000");
    expect(colors.primary).toBe("#1f1f1f");
    expect(colors.muted).toBe("#666666");
    expect(colors.highlight).toBe("#ff6b35");
    expect(colors.secondary).toBe("#ff6b35");
    expect(colors.surface).toBe("#2e2e2e");
    expect(colors.winShadow).toBe("#595959");
  });

  it("generates a full dark palette preserving the background", () => {
    const colors = generateFromAccent("#4fc3f7", "#0f1115");
    expect(colors.background).toBe("#0f1115");
    expect(colors.text).toBe("#000000");
    expect(colors.highlight).toBe("#4fc3f7");
    expect(colors.secondary).toBe("#4fc3f7");
  });

  it("returns different primary colors for light and dark backgrounds", () => {
    const light = generateFromAccent("#4fc3f7", "#ffffff").primary;
    const dark = generateFromAccent("#4fc3f7", "#0f1115").primary;
    expect(light).not.toBe(dark);
  });

  it("always returns valid 6-digit hex colors", () => {
    const colors = generateFromAccent("#4fc3f7", "#0f1115");
    const hexPattern = /^#[0-9a-f]{6}$/;
    for (const value of Object.values(colors)) {
      expect(value).toMatch(hexPattern);
    }
  });

  it("handles light accents on dark backgrounds", () => {
    const colors = generateFromAccent("#ffffff", "#0f1115");
    expect(colors.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors.muted).toMatch(/^#[0-9a-f]{6}$/);
  });
});
