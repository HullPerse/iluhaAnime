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
  WINDOW_TINT_MAX,
  WINDOW_TINT_MIN,
  windowTintAlpha,
} from "@/lib/theme/palette.utils";

/** Blends a face over a desktop colour the way the compositor would. */
function blendOver(face: string, desktop: string, alpha: number): string {
  const base = hexToRgb(face)!;
  const under = hexToRgb(desktop)!;
  return rgbToHex({
    b: under.b + (base.b - under.b) * alpha,
    g: under.g + (base.g - under.g) * alpha,
    r: under.r + (base.r - under.r) * alpha,
  });
}

function pixels(colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

afterEach(() => vi.restoreAllMocks());

describe("window tint alpha", () => {
  it("keeps body text at AA against both a black and a white wallpaper", () => {
    const cases: Array<[string, string]> = [
      ["#c0c0c0", "#000000"],
      ["#1e1e1e", "#d4d4d4"],
      ["#f4c9ef", "#000000"],
    ];
    for (const [face, text] of cases) {
      const alpha = windowTintAlpha(face, text);
      for (const desktop of ["#000000", "#ffffff"]) {
        expect(
          contrastRatio(blendOver(face, desktop, alpha), text),
          `${face} over ${desktop} at ${alpha}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("never drops below the floor that keeps the glass visible", () => {
    // A silver face only needs ~0.6 for AA, but 0.6 makes the effect pointless.
    expect(windowTintAlpha("#c0c0c0", "#000000")).toBe(WINDOW_TINT_MIN);
  });

  it("returns the cap for a pair that can never reach AA, whatever the wallpaper", () => {
    // White text on a white face: no alpha fixes that, so the cap is the answer by default.
    expect(windowTintAlpha("#f3f3f3", "#ffffff")).toBe(WINDOW_TINT_MAX);
  });

  it("never returns a value that misses AA for a face it can fix", () => {
    const alpha = windowTintAlpha("#282c34", "#d4d4d4");
    expect(alpha).toBeGreaterThan(WINDOW_TINT_MIN);
    expect(alpha).toBeLessThan(WINDOW_TINT_MAX);
    for (const desktop of ["#000000", "#ffffff"]) {
      expect(contrastRatio(blendOver("#282c34", desktop, alpha), "#d4d4d4")).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });

  it("falls back to the cap for an unparseable face", () => {
    expect(windowTintAlpha("not-a-colour", "#000000")).toBe(WINDOW_TINT_MAX);
  });
});

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
