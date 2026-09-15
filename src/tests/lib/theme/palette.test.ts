import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildThemeColors,
  contrastRatio,
  hexToRgb,
  mixHex,
  quantizePalette,
  readImagePalette,
  relativeLuminance,
  rgbToHex,
  saturation,
  shade,
} from "@/lib/theme/palette.utils";

function pixels(colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

afterEach(() => vi.restoreAllMocks());

describe("colour conversions", () => {
  it("round-trips hex and rgb", () => {
    expect(hexToRgb("#1a2b3c")).toEqual({ b: 60, g: 43, r: 26 });
    expect(rgbToHex({ b: 60, g: 43, r: 26 })).toBe("#1a2b3c");
  });

  it("rejects malformed hex", () => {
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("rgb(1,2,3)")).toBeNull();
    expect(rgbToHex({ b: 10, g: -5, r: 300 })).toBe("#ff000a");
  });

  it("mixes and shades within the hex space", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
  });

  it("measures luminance, contrast and saturation", () => {
    expect(relativeLuminance({ b: 0, g: 0, r: 0 })).toBeLessThan(
      relativeLuminance({ b: 255, g: 255, r: 255 })
    );
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    expect(contrastRatio("nope", "#ffffff")).toBe(1);
    expect(saturation({ b: 0, g: 0, r: 0 })).toBe(0);
    expect(saturation({ b: 0, g: 0, r: 255 })).toBe(1);
  });
});

describe("quantizePalette", () => {
  it("ranks the dominant colour first and drops near-duplicates", () => {
    const palette = quantizePalette(
      pixels([
        [10, 10, 10, 255],
        [11, 11, 11, 255],
        [240, 240, 240, 255],
      ])
    );
    expect(palette).toEqual(["#0b0b0b", "#f0f0f0"]);
  });

  it("ignores transparent pixels", () => {
    expect(
      quantizePalette(
        pixels([
          [255, 0, 0, 0],
          [0, 0, 255, 255],
        ])
      )
    ).toEqual(["#0000ff"]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 12 }, (_, index): [number, number, number, number] => [
      index * 20,
      255 - index * 20,
      index * 10,
      255,
    ]);
    expect(quantizePalette(pixels(many), 3)).toHaveLength(3);
  });

  it("returns nothing for an empty buffer", () => {
    expect(quantizePalette(new Uint8ClampedArray(0))).toEqual([]);
  });
});

describe("readImagePalette", () => {
  it("reads a palette from the sampled canvas", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({
        data: pixels([
          [255, 0, 0, 255],
          [255, 0, 0, 255],
          [0, 0, 0, 255],
          [0, 0, 0, 255],
        ]),
      }),
    } as unknown as CanvasRenderingContext2D);
    expect(readImagePalette(document.createElement("img"), 2)).toEqual(["#ff0000", "#000000"]);
  });

  it("returns an empty palette when the canvas is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(readImagePalette(document.createElement("img"))).toEqual([]);
  });
});

describe("buildThemeColors", () => {
  it("maps a dark palette onto a dark theme with readable text", () => {
    const colors = buildThemeColors(["#0b0b12", "#3b3b52", "#8f8fff", "#f4f4ff"]);
    expect(colors.background).toBe("#0b0b12");
    expect(colors.text).toBe("#f4f4ff");
    expect(colors.secondary).toBe("#8f8fff");
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThan(7);
  });

  it("maps a light palette onto a light theme", () => {
    const colors = buildThemeColors(["#f7f5ff", "#e2dff0", "#7b6bd6", "#221a33"]);
    expect(colors.background).toBe("#f7f5ff");
    expect(colors.text).toBe("#221a33");
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThan(7);
  });

  it("keeps the bevel edges ordered and the accent colours distinct", () => {
    const colors = buildThemeColors(["#101018", "#2a2a3c", "#37d67a", "#ff5c5c", "#f0f0f8"]);
    const bevelLight = hexToRgb(colors.winHighlight);
    const bevelDark = hexToRgb(colors.winShadow);
    expect(bevelLight).not.toBeNull();
    expect(bevelDark).not.toBeNull();
    expect(relativeLuminance(bevelLight!)).toBeGreaterThan(relativeLuminance(bevelDark!));
    expect(colors.success).toBe("#37d67a");
    expect(colors.destructive).toBe("#ff5c5c");
    expect(colors.linkHover).toBe(colors.highlight);
    expect(colors.autocomplete).toBe(colors.muted);
  });

  it("keeps content backgrounds readable on light and dark palettes", () => {
    const dark = buildThemeColors(["#12121a", "#2a2a3c", "#37d67a", "#e6e6f0"]);
    const light = buildThemeColors(["#f7f5ff", "#e2dff0", "#7b6bd6", "#221a33"]);
    expect(light.field).toBe("#ffffff");
    expect(relativeLuminance(hexToRgb(dark.field)!)).toBeLessThan(
      relativeLuminance(hexToRgb(dark.primary)!)
    );
    expect(hexToRgb(dark.field)).not.toBeNull();
  });

  it("falls back to the win95 palette for an empty or invalid palette", () => {
    expect(buildThemeColors([]).background).toBe("#222222");
    expect(buildThemeColors([]).field).toBe("#ffffff");
    expect(buildThemeColors(["nope", "#12345"]).text).toBe("#000000");
  });
});
