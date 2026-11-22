import { describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/locale/i18n.utils";
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
} from "@/lib/graphics/color.utils";
import { paginate } from "@/lib/core/text/pagination.utils";
import { hashStringToUint32, mulberry32 } from "@/lib/core/text/random.utils";
import {
  buildReproFrontend,
  isSecretKey,
  redactProxyUrl,
  sanitizeReproValue,
} from "@/lib/core/system/repro.utils";
import { formatClock, formatElapsed, formatETA } from "@/lib/core/text/time.utils";

vi.mock("@tauri-apps/api/core", async () => {
  const { mockInvoke } = await import("@/tests/mocks");

  return {
    invoke: mockInvoke,
    convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
  };
});

describe("utils/color", () => {
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
    it.each([
      ["#ff0000", { a: 1, b: 0, g: 0, r: 255 }],
      ["#ff000080", { a: 128 / 255, b: 0, g: 0, r: 255 }],
      ["00ff00", { a: 1, b: 0, g: 255, r: 0 }],
      ["#ff00", null],
      ["red", null],
      ["", null],
      ["#gg0000", null],
    ] as const)("parses %s", (input, expected) => {
      expect(hexToRgba(input)).toEqual(expected);
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
    it.each([
      ["#ff0000", { b: 0, g: 0, r: 255 }],
      ["f00", { b: 0, g: 0, r: 255 }],
      ["  #00FF00  ", { b: 0, g: 255, r: 0 }],
      ["#ff000080", null],
      ["#ff00", null],
      ["red", null],
      ["", null],
    ] as const)("parses %s", (input, expected) => {
      expect(hexToRgb(input)).toEqual(expected);
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
});

describe("utils/pagination", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  describe("paginate", () => {
    it("returns the requested page slice", () => {
      expect(paginate(items, 1, 3)).toEqual([1, 2, 3]);
      expect(paginate(items, 2, 3)).toEqual([4, 5, 6]);
      expect(paginate(items, 3, 3)).toEqual([7]);
    });

    it("returns an empty array past the last page", () => {
      expect(paginate(items, 99, 3)).toEqual([]);
    });

    it("clamps page numbers below one", () => {
      expect(paginate(items, 0, 3)).toEqual([1, 2, 3]);
      expect(paginate(items, -5, 3)).toEqual([1, 2, 3]);
    });

    it("clamps page sizes below one", () => {
      expect(paginate(items, 1, 0)).toEqual([1]);
      expect(paginate(items, 1, -2)).toEqual([1]);
    });

    it("handles empty collections", () => {
      expect(paginate([], 1, 10)).toEqual([]);
    });
  });
});

describe("utils/random", () => {
  describe("hashStringToUint32", () => {
    it("is stable and spreads inputs", () => {
      expect(hashStringToUint32("spotlight:day:2026-09-10")).toBe(
        hashStringToUint32("spotlight:day:2026-09-10")
      );
      expect(hashStringToUint32("a")).not.toBe(hashStringToUint32("b"));
      expect(hashStringToUint32("")).toBe(0x811c9dc5);
    });
  });

  describe("mulberry32", () => {
    it("replays the same sequence per seed", () => {
      const first = mulberry32(42);
      const second = mulberry32(42);
      expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    });

    it("stays within [0, 1)", () => {
      const rng = mulberry32(7);

      for (let i = 0; i < 100; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });
});

describe("utils/time", () => {
  const ru = translate;

  describe("formatClock", () => {
    it.each([
      [Number.NaN, "0:00"],
      [Infinity, "0:00"],
      [-5, "0:00"],
      [5, "0:05"],
      [125, "2:05"],
      [3723, "1:02:03"],
    ] as const)("formats %s as %s", (input, expected) => {
      expect(formatClock(input)).toBe(expected);
    });
  });

  describe("formatETA", () => {
    it.each([
      { secs: null, mode: undefined, t: ru, expected: "" },
      { secs: 0, mode: undefined, t: ru, expected: "" },
      { secs: Infinity, mode: undefined, t: ru, expected: "" },
      { secs: 0, mode: "minute", t: ru, expected: "< 1 мин" },
      { secs: null, mode: "minute", t: ru, expected: "< 1 мин" },
      { secs: Number.NaN, mode: "minute", t: ru, expected: "< 1 мин" },
      { secs: 45, mode: undefined, t: ru, expected: "45 сек" },
      { secs: 125, mode: undefined, t: ru, expected: "2 мин 5 сек" },
      { secs: 90, mode: "minute", t: ru, expected: "1 мин 30 сек" },
      { secs: 3661, mode: undefined, t: ru, expected: "1 ч 1 мин" },
      { secs: 59.6, mode: undefined, t: ru, expected: "60 сек" },
      { secs: 3600, mode: undefined, t: ru, expected: "1 ч 0 мин" },
      { secs: -5, mode: undefined, t: ru, expected: "" },
      { secs: -5, mode: "minute", t: ru, expected: "< 1 мин" },
    ] as const)("formats %s as %s", ({ secs, mode, t, expected }) => {
      expect(formatETA(secs, t, mode)).toBe(expected);
    });
  });

  describe("formatElapsed", () => {
    it.each([
      { secs: 45, t: ru, expected: "45 сек" },
      { secs: 120, t: ru, expected: "2 мин" },
      { secs: 125, t: ru, expected: "2 мин 5 сек" },
      { secs: Number.NaN, t: ru, expected: "0 сек" },
      { secs: -5, t: ru, expected: "0 сек" },
      { secs: 0, t: ru, expected: "0 сек" },
    ] as const)("formats %s as %s", ({ secs, t, expected }) => {
      expect(formatElapsed(secs, t)).toBe(expected);
    });
  });
});

describe("utils/repro", () => {
  describe("isSecretKey", () => {
    it.each([
      ["authToken", true],
      ["nekobt_api_key", true],
      ["proxyPassword", true],
      ["cookie", true],
      ["theme", false],
      ["proxyUrl", false],
    ] as const)("classifies %s as %s", (key, expected) => {
      expect(isSecretKey(key)).toBe(expected);
    });
  });

  describe("redactProxyUrl", () => {
    it("strips userinfo keeping host", () => {
      expect(redactProxyUrl("socks5://user:pass@host:1080")).toBe("socks5://***@host:1080");
    });
    it("leaves clean urls alone", () => {
      expect(redactProxyUrl("socks5://host:1080")).toBe("socks5://host:1080");
    });
  });

  describe("sanitizeReproValue", () => {
    it("redacts secret keys", () => {
      const out = sanitizeReproValue({ authToken: "abc", theme: "win95" }) as Record<
        string,
        unknown
      >;
      expect(out.theme).toBe("win95");
      expect(out.authToken).toBe("[redacted]");
    });
    it("redacts proxy userinfo", () => {
      const out = sanitizeReproValue({ proxyUrl: "socks5://u:p@h:1080" }) as Record<
        string,
        unknown
      >;
      expect(out.proxyUrl).toBe("socks5://***@h:1080");
    });
    it("truncates long strings and caps arrays", () => {
      const out = sanitizeReproValue({
        list: Array.from({ length: 250 }, (_, i) => i),
        s: "x".repeat(600),
      }) as { s: string; list: unknown[] };
      expect(out.s).toHaveLength(500 + "[truncated]".length);
      expect(out.list).toHaveLength(200);
    });
    it("stringifies bigints and drops functions", () => {
      const out = sanitizeReproValue({ big: 10n, fn: () => 1 }) as Record<string, unknown>;
      expect(out.big).toBe("10");
      expect(out.fn).toBeUndefined();
    });
  });

  describe("buildReproFrontend", () => {
    it("emits version plus sanitized settings plus counts", () => {
      const parsed = JSON.parse(
        buildReproFrontend({
          counts: { history: 3 },
          settings: { authToken: "x" },
          version: "5.0.0",
        })
      ) as { version: string; settings: { authToken: string }; counts: { history: number } };
      expect(parsed.version).toBe("5.0.0");
      expect(parsed.settings.authToken).toBe("[redacted]");
      expect(parsed.counts.history).toBe(3);
    });
  });
});
