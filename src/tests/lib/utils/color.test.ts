import { describe, expect, it } from "vitest";

import {
  formatColor,
  hexToHsv,
  hexToRgba,
  hexToRgb,
  hslToHsv,
  hslToRgb,
  hsvToChannelStrings,
  hsvToHex,
  hsvToRgb,
  normalizeHue,
  parseColor,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbaToHex,
} from "@/lib/utils/color.utils";

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

describe("rgbToHsv", () => {
  it("reads the primaries as full saturation and value", () => {
    expect(rgbToHsv({ b: 0, g: 0, r: 255 })).toEqual({ h: 0, s: 100, v: 100 });
    expect(rgbToHsv({ b: 0, g: 255, r: 0 })).toEqual({ h: 120, s: 100, v: 100 });
    expect(rgbToHsv({ b: 255, g: 0, r: 0 })).toEqual({ h: 240, s: 100, v: 100 });
  });

  it("reads a grey as having no hue and no saturation", () => {
    const grey = rgbToHsv({ b: 128, g: 128, r: 128 });
    expect(grey.h).toBe(0);
    expect(grey.s).toBe(0);
    expect(grey.v).toBeCloseTo(50.196, 2);
  });

  it("reads black and white as the ends of the value axis", () => {
    expect(rgbToHsv({ b: 0, g: 0, r: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    expect(rgbToHsv({ b: 255, g: 255, r: 255 })).toEqual({ h: 0, s: 0, v: 100 });
  });

  it("keeps hue inside 0-360", () => {
    expect(normalizeHue(360)).toBe(0);
    expect(normalizeHue(-30)).toBe(330);
    expect(normalizeHue(750)).toBe(30);
  });
});

describe("hsvToRgb", () => {
  it("writes the primaries back", () => {
    expect(hsvToRgb({ h: 0, s: 100, v: 100 })).toEqual({ b: 0, g: 0, r: 255 });
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ b: 0, g: 255, r: 0 });
    expect(hsvToRgb({ h: 240, s: 100, v: 100 })).toEqual({ b: 255, g: 0, r: 0 });
  });

  it("treats hue 360 as hue 0 and clamps saturation and value", () => {
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual(hsvToRgb({ h: 0, s: 100, v: 100 }));
    expect(hsvToRgb({ h: 0, s: 200, v: 200 })).toEqual(hsvToRgb({ h: 0, s: 100, v: 100 }));
    expect(hsvToRgb({ h: 0, s: -50, v: 50 })).toEqual({ b: 128, g: 128, r: 128 });
  });
});

describe("hex to hsv round trip", () => {
  it("returns a sample of values untouched", () => {
    const samples = [
      "#ff8800",
      "#123456",
      "#abcdef",
      "#010203",
      "#808080",
      "#00ffaa",
      "#000000",
      "#ffffff",
      "#ff0000",
    ];
    const changed = samples.filter((sample) => {
      const hsv = hexToHsv(sample);
      return hsv === null || hsvToHex(hsv) !== sample;
    });
    expect(changed).toEqual([]);
  });
});

describe("hexToRgb", () => {
  it("accepts six digits, the three-digit shorthand and a missing hash", () => {
    expect(hexToRgb("#ff0000")).toEqual({ b: 0, g: 0, r: 255 });
    expect(hexToRgb("f00")).toEqual({ b: 0, g: 0, r: 255 });
    expect(hexToRgb("  #00FF00  ")).toEqual({ b: 0, g: 255, r: 0 });
  });

  it("rejects alpha forms and anything that is not hex", () => {
    expect(hexToRgb("#ff000080")).toBeNull();
    expect(hexToRgb("#ff00")).toBeNull();
    expect(hexToRgb("red")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("hsl", () => {
  it("converts red and grey both ways", () => {
    expect(rgbToHsl({ b: 0, g: 0, r: 255 })).toEqual({ h: 0, l: 50, s: 100 });
    expect(hslToRgb({ h: 0, l: 50, s: 100 })).toEqual({ b: 0, g: 0, r: 255 });
    expect(rgbToHsl({ b: 64, g: 64, r: 64 })).toEqual({ h: 0, l: 25, s: 0 });
  });

  it("feeds the plane: a full-saturation mid-lightness red is value 100", () => {
    expect(hslToHsv({ h: 0, l: 50, s: 100 })).toEqual({ h: 0, s: 100, v: 100 });
    expect(hslToHsv({ h: 180, l: 100, s: 0 })).toEqual({ h: 180, s: 0, v: 100 });
  });
});

describe("channel strings and formatted values", () => {
  it("writes the three fields for both channel formats", () => {
    expect(hsvToChannelStrings({ h: 30, s: 100, v: 100 }, "rgb")).toEqual(["255", "128", "0"]);
    expect(hsvToChannelStrings({ h: 0, s: 100, v: 100 }, "hsl")).toEqual(["0", "100", "50"]);
  });

  it("formats the same colour as hex, rgb and hsl", () => {
    const red = { h: 0, s: 100, v: 100 };
    expect(formatColor(red, "hex")).toBe("#ff0000");
    expect(formatColor(red, "rgb")).toBe("255, 0, 0");
    expect(formatColor(red, "hsl")).toBe("0, 100%, 50%");
  });
});

describe("parseColor", () => {
  it("reads back every format it writes", () => {
    const red = { h: 0, s: 100, v: 100 };
    expect(parseColor("#ff0000", "hex")).toEqual(red);
    expect(parseColor("255, 0, 0", "rgb")).toEqual(red);
    expect(parseColor("rgb(255 0 0)", "rgb")).toEqual(red);
    expect(parseColor("0, 100%, 50%", "hsl")).toEqual(red);
  });

  it("clamps values that are out of range", () => {
    expect(parseColor("999, -20, 0", "rgb")).toEqual({ h: 0, s: 100, v: 100 });
  });

  it("returns null when there is nothing to read", () => {
    expect(parseColor("not a colour", "hex")).toBeNull();
    expect(parseColor("1, 2", "rgb")).toBeNull();
    expect(parseColor("", "hsl")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("writes the tuple form used by the wallpaper code", () => {
    expect(rgbToHex([255, 128, 0])).toBe("#ff8000");
  });
});
