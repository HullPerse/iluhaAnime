import { describe, expect, it } from "vitest";

import { hexToRgba, hexToRgb, rgbaToHex, rgbToHex } from "@/lib/color.utils";

describe("rgbaToHex", () => {
  it("converts rgb to hex", () => {
    expect(rgbaToHex({ a: 1, b: 0, g: 0, r: 255 })).toBe("#ff0000");
    expect(rgbaToHex({ a: 1, b: 255, g: 128, r: 0 })).toBe("#0080ff");
  });

  it("includes alpha when requested", () => {
    expect(rgbaToHex({ a: 1, b: 0, g: 0, r: 255 }, true)).toBe("#ff0000ff");
    expect(rgbaToHex({ a: 0.5, b: 0, g: 0, r: 255 }, true)).toBe("#ff000080");
  });
});

describe("hexToRgba", () => {
  it("parses 6-digit hex with full alpha", () => {
    expect(hexToRgba("#ff0000")).toEqual({ a: 1, b: 0, g: 0, r: 255 });
  });

  it("parses 8-digit hex with alpha", () => {
    expect(hexToRgba("#ff000080")).toEqual({
      a: 128 / 255,
      b: 0,
      g: 0,
      r: 255,
    });
  });

  it("handles hex without the hash", () => {
    expect(hexToRgba("00ff00")).toEqual({ a: 1, b: 0, g: 255, r: 0 });
  });

  it("returns null for invalid input", () => {
    expect(hexToRgba("#ff00")).toBeNull();
    expect(hexToRgba("red")).toBeNull();
    expect(hexToRgba("")).toBeNull();
    expect(hexToRgba("#gg0000")).toBeNull();
  });
});

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#00ff00")).toEqual([0, 255, 0]);
  });

  it("returns null for wrong length or invalid input", () => {
    expect(hexToRgb("#00ff")).toBeNull();
    expect(hexToRgb("#ff0000ff")).toBeNull();
    expect(hexToRgb("nope")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("rounds and converts channels", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
    expect(rgbToHex(0, 128, 255)).toBe("#0080ff");
    expect(rgbToHex(1.4, 0, 0)).toBe("#010000");
  });
});
