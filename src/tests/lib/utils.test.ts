import { describe, expect, it, vi } from "vitest";
import { translateFor } from "@/lib/locale/i18n.utils";
import { uniqueById } from "@hullperse/hp_utils/array";
import {
  attempt,
  attemptSequence,
  attemptSync,
  toError,
  withFallback,
} from "@hullperse/hp_utils/attempt";
import { formatBytes, formatRate } from "@hullperse/hp_utils/bytes";
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
import { createLruCache, inflightFetch } from "@hullperse/hp_utils/lruCache";
import { clamp } from "@hullperse/hp_utils/math";
import { paginate } from "@/lib/core/text/pagination.utils";
import { hashStringToUint32, mulberry32 } from "@/lib/core/text/random.utils";
import {
  buildReproFrontend,
  isSecretKey,
  redactProxyUrl,
  sanitizeReproValue,
} from "@/lib/core/system/repro.utils";
import {
  andThen,
  attemptResult,
  attemptResultSync,
  err,
  map,
  ok,
  unwrapOr,
} from "@hullperse/hp_utils/result";
import { formatClock, formatElapsed, formatETA } from "@/lib/core/text/time.utils";

vi.mock("@tauri-apps/api/core", async () => {
  const { mockInvoke } = await import("@/tests/mocks");
  return {
    invoke: mockInvoke,
    convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
  };
});

describe("utils/array", () => {
  describe("uniqueById", () => {
    it("keeps the first occurrence of each id", () => {
      const items = [
        { id: 95, name: "Hero" },
        { id: 95, name: "Hero duplicate" },
        { id: 96, name: "Sidekick" },
      ];
      expect(uniqueById(items, (item) => item.id)).toEqual([
        { id: 95, name: "Hero" },
        { id: 96, name: "Sidekick" },
      ]);
    });

    it("supports a nested id selector", () => {
      const edges = [
        { role: "MAIN", character: { id: 95 } },
        { role: "SUPPORTING", character: { id: 95 } },
        { role: "MAIN", character: { id: 96 } },
      ];
      expect(uniqueById(edges, (edge) => edge.character.id)).toEqual([
        { role: "MAIN", character: { id: 95 } },
        { role: "MAIN", character: { id: 96 } },
      ]);
    });

    it("returns an empty list untouched", () => {
      expect(uniqueById([], (item: { id: number }) => item.id)).toEqual([]);
    });
  });
});

describe("utils/attempt", () => {
  describe("toError", () => {
    it("passes Error instances through untouched", () => {
      const cause = new Error("boom");
      expect(toError(cause)).toBe(cause);
    });

    it("wraps strings, nullish, and objects in an Error", () => {
      expect(toError("nope")).toEqual(new Error("nope"));
      expect(toError(undefined)).toEqual(new Error("undefined"));
      expect(toError(42)).toEqual(new Error("42"));
    });
  });

  describe("attempt", () => {
    it("resolves fulfilled values with a null error", async () => {
      await expect(attempt(Promise.resolve(7))).resolves.toEqual([7, null]);
    });

    it("keeps falsy fulfilled values distinct from failure", async () => {
      await expect(attempt(Promise.resolve(0))).resolves.toEqual([0, null]);
      await expect(attempt(Promise.resolve(null))).resolves.toEqual([null, null]);
    });

    it("converts rejections into a null-data tuple instead of throwing", async () => {
      const failure = new Error("down");
      await expect(attempt(Promise.reject(failure))).resolves.toEqual([null, failure]);
    });

    it("normalizes non-Error rejections", async () => {
      const plain = "plain" as unknown as Error;
      await expect(attempt(Promise.reject(plain))).resolves.toEqual([null, new Error("plain")]);
    });
  });

  describe("attemptSync", () => {
    it("returns the value with a null error", () => {
      expect(attemptSync(() => 3)).toEqual([3, null]);
    });

    it("converts throws into a null-data tuple", () => {
      const failure = new Error("sync boom");
      expect(
        attemptSync(() => {
          throw failure;
        })
      ).toEqual([null, failure]);
    });

    it("normalizes non-Error throws", () => {
      const literal = "string throw" as unknown as Error;
      expect(
        attemptSync(() => {
          throw literal;
        })
      ).toEqual([null, new Error("string throw")]);
    });
  });

  describe("attemptSequence", () => {
    it("runs every step in order and resolves null", async () => {
      const order: string[] = [];
      await expect(
        attemptSequence([
          () => order.push("a"),
          async () => {
            order.push("b");
          },
          () => order.push("c"),
        ])
      ).resolves.toBeNull();
      expect(order).toEqual(["a", "b", "c"]);
    });

    it("awaits a step before starting the next one", async () => {
      const order: string[] = [];
      await attemptSequence([
        async () => {
          await Promise.resolve();
          order.push("first");
        },
        () => order.push("second"),
      ]);
      expect(order).toEqual(["first", "second"]);
    });

    it("stops at the first failure and resolves that error", async () => {
      const failure = new Error("step down");
      const order: string[] = [];
      const error = await attemptSequence([
        () => order.push("a"),
        () => {
          throw failure;
        },
        () => order.push("c"),
      ]);
      expect(error).toBe(failure);
      expect(order).toEqual(["a"]);
    });

    it("normalizes a non-Error rejection", async () => {
      const plain = "nope" as unknown as Error;
      await expect(attemptSequence([() => Promise.reject(plain)])).resolves.toEqual(
        new Error("nope")
      );
    });

    it("resolves null for an empty step list", async () => {
      await expect(attemptSequence([])).resolves.toBeNull();
    });

    it("always runs onFinally, after success and after failure", async () => {
      const order: string[] = [];
      await attemptSequence([() => order.push("step")], { onFinally: () => order.push("finally") });
      expect(order).toEqual(["step", "finally"]);

      order.length = 0;
      await attemptSequence(
        [
          () => {
            throw new Error("boom");
          },
        ],
        { onFinally: () => order.push("finally") }
      );
      expect(order).toEqual(["finally"]);
    });

    it("keeps the step error when the cleanup also fails", async () => {
      const failure = new Error("step");
      const error = await attemptSequence(
        [
          () => {
            throw failure;
          },
        ],
        {
          onFinally: () => {
            throw new Error("cleanup");
          },
        }
      );
      expect(error).toBe(failure);
    });

    it("surfaces a cleanup failure when the steps succeeded", async () => {
      const cleanup = "cleanup" as unknown as Error;
      await expect(
        attemptSequence([() => undefined], { onFinally: () => Promise.reject(cleanup) })
      ).resolves.toEqual(new Error("cleanup"));
    });
  });

  describe("withFallback", () => {
    it("resolves the value when the promise fulfills", async () => {
      await expect(withFallback(Promise.resolve("ok"), "fallback")).resolves.toBe("ok");
    });

    it("resolves null data as-is instead of substituting the fallback", async () => {
      await expect(withFallback(Promise.resolve(null), "fallback")).resolves.toBeNull();
    });

    it("resolves the fallback when the promise rejects", async () => {
      await expect(withFallback(Promise.reject(new Error("down")), "fallback")).resolves.toBe(
        "fallback"
      );
    });
  });
});

describe("utils/bytes", () => {
  describe("formatBytes", () => {
    it("formats bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(512)).toBe("512 B");
    });

    it("formats KB with one decimal", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
    });

    it("formats MB with one decimal", () => {
      expect(formatBytes(1_048_576)).toBe("1.0 MB");
      expect(formatBytes(1_572_864)).toBe("1.5 MB");
    });

    it("formats GB with two decimals instead of capping at MB", () => {
      expect(formatBytes(1_073_741_824)).toBe("1.00 GB");
      expect(formatBytes(1_610_612_736)).toBe("1.50 GB");
      expect(formatBytes(2_147_483_648)).toBe("2.00 GB");
    });
  });

  describe("formatRate", () => {
    it("formats a known rate", () => {
      expect(formatRate(500)).toBe("500 B/s");
      expect(formatRate(2048)).toBe("2.0 KB/s");
      expect(formatRate(2_097_152)).toBe("2.0 MB/s");
    });

    it("returns an empty string when there is no rate", () => {
      expect(formatRate(0)).toBe("");
      expect(formatRate(-1)).toBe("");
      expect(formatRate(Number.NaN)).toBe("");
    });
  });
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

describe("utils/math", () => {
  describe("clamp", () => {
    it("pins values below the lower bound to min", () => {
      expect(clamp(-1, 0, 10)).toBe(0);
    });

    it("pins values above the upper bound to max", () => {
      expect(clamp(99, 0, 10)).toBe(10);
    });

    it("keeps values inside the range and on the boundaries untouched", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it("works with fractional and negative bounds", () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(-0.5, -1, 1)).toBe(-0.5);
    });
  });
});

describe("utils/lruCache", () => {
  describe("createLruCache", () => {
    it("stores and returns values", () => {
      const cache = createLruCache<string, number>(2);
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
      expect(cache.peek("a")).toBe(1);
      expect(cache.has("a")).toBe(true);
    });

    it("returns undefined and counts a miss for absent keys", () => {
      const cache = createLruCache<string, number>(2);
      expect(cache.get("missing")).toBeUndefined();
      const stats = cache.stats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it("evicts the least-recently-used entry when full", () => {
      const cache = createLruCache<string, number>(2);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(true);
      expect(cache.has("c")).toBe(true);
      expect(cache.stats().evictions).toBe(1);
    });

    it("keeps a touched entry over an untouched one", () => {
      const cache = createLruCache<string, number>(2);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.get("a");
      cache.set("c", 3);
      expect(cache.has("a")).toBe(true);
      expect(cache.has("b")).toBe(false);
    });

    it("counts hits and misses across the cache lifetime", () => {
      const cache = createLruCache<string, number>(2);
      cache.set("a", 1);
      cache.get("a");
      cache.get("a");
      cache.get("b");
      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(1);
      expect(stats.capacity).toBe(2);
    });

    it("replaces the value without evicting when the key exists", () => {
      const cache = createLruCache<string, number>(2);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("a", 10);
      expect(cache.get("a")).toBe(10);
      expect(cache.has("b")).toBe(true);
      expect(cache.stats().evictions).toBe(0);
    });

    it("delete and clear remove entries", () => {
      const cache = createLruCache<string, number>(2);
      cache.set("a", 1);
      expect(cache.delete("a")).toBe(true);
      expect(cache.delete("a")).toBe(false);
      cache.set("b", 2);
      cache.clear();
      expect(cache.stats().size).toBe(0);
      expect(cache.has("b")).toBe(false);
    });

    it("treats capacity below 1 as 1", () => {
      const cache = createLruCache<string, number>(0);
      cache.set("a", 1);
      cache.set("b", 2);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(true);
    });
  });

  describe("inflightFetch", () => {
    it("runs the loader once for concurrent callers", async () => {
      const inflight = new Map<string, Promise<string | null>>();
      const start = vi.fn(async () => "v");
      const [a, b] = await Promise.all([
        inflightFetch(inflight, "k", start),
        inflightFetch(inflight, "k", start),
      ]);
      expect(a).toBe("v");
      expect(b).toBe("v");
      expect(start).toHaveBeenCalledTimes(1);
    });

    it("starts a new load after the previous settles", async () => {
      const inflight = new Map<string, Promise<string | null>>();
      let n = 0;
      const start = async () => `v${(n += 1)}`;
      expect(await inflightFetch(inflight, "k", start)).toBe("v1");
      expect(await inflightFetch(inflight, "k", start)).toBe("v2");
    });

    it("clears the entry on failure so the next caller retries", async () => {
      const inflight = new Map<string, Promise<string | null>>();
      const fail = vi.fn(async (): Promise<string | null> => {
        throw new Error("down");
      });
      await expect(inflightFetch(inflight, "k", fail)).rejects.toThrow("down");
      expect(inflight.has("k")).toBe(false);
      const ok = async (): Promise<string | null> => "v";
      expect(await inflightFetch(inflight, "k", ok)).toBe("v");
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

describe("utils/result", () => {
  describe("ok / err", () => {
    it("wrap the two outcomes", () => {
      expect(ok(3)).toEqual({ ok: true, value: 3 });
      expect(err("boom")).toEqual({ ok: false, error: new Error("boom") });
    });

    it("keeps falsy successes distinct from failures", () => {
      expect(ok(0)).toEqual({ ok: true, value: 0 });
      expect(ok(null)).toEqual({ ok: true, value: null });
      expect(ok(undefined)).toEqual({ ok: true, value: undefined });
    });

    it("passes Error instances through untouched", () => {
      const cause = new Error("cause");
      expect(err(cause)).toEqual({ ok: false, error: cause });
    });
  });

  describe("attemptResult", () => {
    it("resolves fulfilled values", async () => {
      await expect(attemptResult(Promise.resolve("ok"))).resolves.toEqual({
        ok: true,
        value: "ok",
      });
    });

    it("turns rejections into failures instead of throwing", async () => {
      const failure = new Error("down");
      await expect(attemptResult(Promise.reject(failure))).resolves.toEqual({
        ok: false,
        error: failure,
      });
    });

    it("normalizes non-Error rejections", async () => {
      const plain = "plain" as unknown as Error;
      await expect(attemptResult(Promise.reject(plain))).resolves.toEqual({
        ok: false,
        error: new Error("plain"),
      });
    });
  });

  describe("attemptResultSync", () => {
    it("returns the value, or the thrown error", () => {
      expect(attemptResultSync(() => 1)).toEqual({ ok: true, value: 1 });
      expect(
        attemptResultSync(() => {
          throw new Error("sync boom");
        })
      ).toEqual({ ok: false, error: new Error("sync boom") });
    });
  });

  describe("map", () => {
    it("transforms a success and leaves a failure alone", () => {
      expect(map(ok(2), (value) => value * 3)).toEqual({ ok: true, value: 6 });

      const failure = err("boom");
      expect(map(failure, (value: number) => value * 3)).toBe(failure);
    });
  });

  describe("andThen", () => {
    it("runs the next step on success", async () => {
      await expect(andThen(ok(2), (value) => ok(value + 1))).resolves.toEqual({
        ok: true,
        value: 3,
      });
    });

    it("awaits async steps", async () => {
      await expect(andThen(ok(1), async (value) => ok(value + 1))).resolves.toEqual({
        ok: true,
        value: 2,
      });
    });

    it("short-circuits on failure without running the step", async () => {
      const failure = err("first step failed");
      let ran = false;
      const chained = await andThen(failure, () => {
        ran = true;
        return ok("never");
      });
      expect(ran).toBe(false);
      expect(chained).toEqual(failure);
    });

    it("keeps a failing step's error", async () => {
      const thrown = new Error("step threw");
      await expect(
        andThen(ok(1), () => {
          throw thrown;
        })
      ).resolves.toEqual({ ok: false, error: thrown });
    });
  });

  describe("unwrapOr", () => {
    it("returns the value or the fallback", () => {
      expect(unwrapOr(ok("value"), "fallback")).toBe("value");
      expect(unwrapOr(err("boom"), "fallback")).toBe("fallback");
      expect(unwrapOr(err("boom"), null)).toBeNull();
    });
  });
});

describe("utils/time", () => {
  const ru = (key: Parameters<typeof translateFor>[1], vars?: Parameters<typeof translateFor>[2]) =>
    translateFor("ru", key, vars);

  const en = (key: Parameters<typeof translateFor>[1], vars?: Parameters<typeof translateFor>[2]) =>
    translateFor("en", key, vars);

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
      { secs: 45, mode: undefined, t: en, expected: "45 sec" },
      { secs: 125, mode: undefined, t: en, expected: "2 min 5 sec" },
      { secs: 3661, mode: undefined, t: en, expected: "1 h 1 min" },
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
      { secs: 45, t: en, expected: "45 sec" },
      { secs: 125, t: en, expected: "2 min 5 sec" },
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
      const out = sanitizeReproValue({ torrentProxyUrl: "socks5://u:p@h:1080" }) as Record<
        string,
        unknown
      >;
      expect(out.torrentProxyUrl).toBe("socks5://***@h:1080");
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
