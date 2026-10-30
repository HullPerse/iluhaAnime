import type { KeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DITHER_BAND_ROWS,
  DITHER_DEFAULTS,
  DITHER_RENDER_CACHE_CAPACITY,
  resolveDitherPreset,
} from "@/config/graphics/dither.config";
import { translate } from "@/lib/locale/i18n.utils";
import { uniqueById } from "@/lib/core/array.utils";
import { attempt, attemptAll, attemptSync, toError, withFallback } from "@/lib/core/attempt.utils";
import { formatBytes, formatRate } from "@/lib/core/bytes.utils";
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
import {
  buildAnimeLink,
  buildCollectionShareLink,
  buildStreamLink,
  buildTorrentLink,
  ingestDeepLinks,
  isEditablePasteTarget,
  parseAnimeLink,
  parseAnilistAuthCallback,
  parseAnilistPageUrl,
  parseCollectionShareLink,
  parsePastedLink,
  parseStreamLink,
  parseTorrentLink,
} from "@/lib/core/deeplink.utils";
import type { AnimeDeepLink } from "@/lib/core/deeplink.utils";
import {
  applyGlyphOverlay,
  applyHalftoneDots,
  clampChannel,
  hashNoise,
  lerp,
  linearChannelToSrgb,
  luminance,
  matrixThreshold,
  nearestPaletteColor,
  nearestPaletteIndexLinear,
  renderDitherImage,
  sampleChannel,
  smoothNoise,
  srgbChannelToLinear,
} from "@/lib/graphics/ditherRender.utils";
import {
  ditherBuffersEqual,
  ditherCacheKey,
  ditherRenderCache,
  extractPaletteFromPixels,
  subscribeWorkerJob,
} from "@/lib/graphics/dither.utils";
import {
  USER_IMAGE_PREFIX,
  assetUrl,
  isUserImageIcon,
  toUserImage,
} from "@/lib/graphics/image.utils";
import {
  createListNavigationHandler,
  enterOrSpace,
  enterSubmit,
  moveIndex,
} from "@/lib/ui/keyboard.utils";
import { createLruCache, inflightFetch } from "@/lib/core/lruCache.utils";
import { clamp } from "@/lib/core/math.utils";
import { paginate } from "@/lib/core/pagination.utils";
import { hashStringToUint32, mulberry32 } from "@/lib/core/random.utils";
import {
  buildReproFrontend,
  isSecretKey,
  redactProxyUrl,
  sanitizeReproValue,
} from "@/lib/core/repro.utils";
import {
  andThen,
  attemptResult,
  attemptResultSync,
  err,
  map,
  ok,
  unwrapOr,
} from "@/lib/core/result.utils";
import { formatClock, formatElapsed, formatETA } from "@/lib/core/time.utils";
import type { CollectionItem } from "@/types/anilist/collection";
import type { DitherEffectOptions, DitherRGB } from "@/types/graphics/dither";
import type { AniListId, TorrentHash } from "@/types/core/types";

// The factory resolves the shared mock itself: a top-level import would be
// read before this hoisted call and the whole suite would fail to load.
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

  describe("attemptAll", () => {
    it("runs every step in order and resolves null", async () => {
      const order: string[] = [];
      await expect(
        attemptAll([
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
      await attemptAll([
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
      const error = await attemptAll([
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
      await expect(attemptAll([() => Promise.reject(plain)])).resolves.toEqual(new Error("nope"));
    });

    it("resolves null for an empty step list", async () => {
      await expect(attemptAll([])).resolves.toBeNull();
    });

    it("always runs onFinally, after success and after failure", async () => {
      const order: string[] = [];
      await attemptAll([() => order.push("step")], { onFinally: () => order.push("finally") });
      expect(order).toEqual(["step", "finally"]);

      order.length = 0;
      await attemptAll(
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
      const error = await attemptAll(
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
        attemptAll([() => undefined], { onFinally: () => Promise.reject(cleanup) })
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

describe("utils/deeplink", () => {
  describe("buildAnimeLink", () => {
    it("builds the exact anilist shape", () => {
      expect(buildAnimeLink(21 as AniListId)).toBe("iluhaanime://anime/anilist/21");
    });
  });

  describe("parseAnimeLink", () => {
    it("parses a valid link", () => {
      expect(parseAnimeLink("iluhaanime://anime/anilist/21")).toEqual({
        source: "anilist",
        id: 21,
      });
    });

    it("accepts an uppercase scheme", () => {
      expect(parseAnimeLink("ILUHAANIME://anime/anilist/21")?.id).toBe(21);
    });

    it("rejects foreign schemes and lookalikes", () => {
      expect(parseAnimeLink("https://anilist.co/anime/21")).toBeNull();
      expect(parseAnimeLink("xiluhaanime://anime/anilist/21")).toBeNull();
      expect(parseAnimeLink("iluhaanime2://anime/anilist/21")).toBeNull();
    });

    it("rejects wrong shape", () => {
      expect(parseAnimeLink("iluhaanime://anime/collection/abc")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/21/extra")).toBeNull();
    });

    it("rejects bad ids", () => {
      expect(parseAnimeLink("iluhaanime://anime/anilist/0")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/-5")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/12a")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/12345678901")).toBeNull();
    });

    it("trims surrounding whitespace and leading zeros", () => {
      expect(parseAnimeLink("  iluhaanime://anime/anilist/21  ")?.id).toBe(21);
      expect(parseAnimeLink("iluhaanime://anime/anilist/007")?.id).toBe(7);
      expect(parseAnimeLink("iluhaanime://anime/anilist/1234567890")?.id).toBe(1234567890);
    });

    it("rejects query strings and fragments", () => {
      expect(parseAnimeLink("iluhaanime://anime/anilist/21?x=1")).toBeNull();
      expect(parseAnimeLink("iluhaanime://anime/anilist/21#frag")).toBeNull();
    });

    it("rejects empty and blank input", () => {
      expect(parseAnimeLink("")).toBeNull();
      expect(parseAnimeLink("   ")).toBeNull();
    });

    it("round-trips through the builder", () => {
      expect(parseAnimeLink(buildAnimeLink(5114 as AniListId))).toEqual({
        source: "anilist",
        id: 5114,
      });
    });
  });

  describe("stream links", () => {
    const SLUG = "21371--sousou-no-frieren-anime";

    it("builds the animelib shape and round-trips it", () => {
      const link = buildStreamLink(SLUG);
      expect(link).toBe(`iluhaanime://stream/animelib/${SLUG}`);
      expect(parseStreamLink(link)).toEqual({ source: "animelib", slug: SLUG });
    });

    it("rejects another source, a missing slug and a bad slug", () => {
      expect(parseStreamLink(`iluhaanime://stream/kodik/${SLUG}`)).toBeNull();
      expect(parseStreamLink("iluhaanime://stream/animelib")).toBeNull();
      expect(parseStreamLink("iluhaanime://stream/animelib/nonaruto")).toBeNull();
      expect(parseStreamLink(`iluhaanime://stream/animelib/${SLUG}?x=1`)).toBeNull();
      expect(parseStreamLink(`https://animelib.org/anime/${SLUG}`)).toBeNull();
    });

    it("is recognized as a pasted link", () => {
      expect(parsePastedLink(buildStreamLink(SLUG))).toEqual({
        kind: "stream",
        link: { source: "animelib", slug: SLUG },
      });
    });

    it("reaches its own open callback instead of the anime one", () => {
      const streams: string[] = [];
      const anime: AnimeDeepLink[] = [];
      ingestDeepLinks(
        [buildStreamLink(SLUG)],
        (link) => {
          anime.push(link);
        },
        () => undefined,
        undefined,
        undefined,
        undefined,
        (link) => {
          streams.push(link.slug);
        }
      );

      expect(streams).toEqual([SLUG]);
      expect(anime).toEqual([]);
    });
  });

  describe("ingestDeepLinks", () => {
    function setup() {
      const opened: AnimeDeepLink[] = [];
      let invalid = 0;
      const run = (urls: unknown) =>
        ingestDeepLinks(
          urls,
          (link) => {
            opened.push(link);
          },
          () => {
            invalid += 1;
          }
        );
      return { opened, run, invalidCalls: () => invalid };
    }

    it("opens every valid link without flagging", () => {
      const s = setup();
      s.run(["iluhaanime://anime/anilist/21", buildAnimeLink(5114 as AniListId)]);
      expect(s.opened).toEqual([
        { source: "anilist", id: 21 },
        { source: "anilist", id: 5114 },
      ]);
      expect(s.invalidCalls()).toBe(0);
    });

    it("ignores non-array payloads silently", () => {
      const s = setup();
      s.run(null);
      s.run("iluhaanime://anime/anilist/21");
      expect(s.opened).toEqual([]);
      expect(s.invalidCalls()).toBe(0);
    });

    it("flags once for mixed bad entries and keeps the good ones", () => {
      const s = setup();
      s.run(["iluhaanime://anime/anilist/21", "https://evil.example/x", 42, "iluhaanime://nope"]);
      expect(s.opened).toEqual([{ source: "anilist", id: 21 }]);
      expect(s.invalidCalls()).toBe(1);
    });

    it("flags an all-bad batch once", () => {
      const s = setup();
      s.run(["junk", 7]);
      expect(s.opened).toEqual([]);
      expect(s.invalidCalls()).toBe(1);
    });
  });

  describe("parseAnilistAuthCallback", () => {
    it("reads the token from the fragment", () => {
      expect(
        parseAnilistAuthCallback("iluhaanime://auth/anilist#access_token=abc123&token_type=bearer")
      ).toEqual({ accessToken: "abc123" });
    });

    it("falls back to the query string", () => {
      expect(parseAnilistAuthCallback("iluhaanime://auth/anilist?access_token=abc123")).toEqual({
        accessToken: "abc123",
      });
    });

    it("accepts an uppercase scheme and surrounding whitespace", () => {
      expect(parseAnilistAuthCallback("  ILUHAANIME://auth/anilist#access_token=abc123  ")).toEqual(
        {
          accessToken: "abc123",
        }
      );
    });

    it("rejects foreign schemes, wrong paths and extra segments", () => {
      expect(parseAnilistAuthCallback("https://anilist.co")).toBeNull();
      expect(parseAnilistAuthCallback("iluhaanime://anime/anilist/21")).toBeNull();
      expect(parseAnilistAuthCallback("iluhaanime://auth/anilist/extra#access_token=x")).toBeNull();
      expect(parseAnilistAuthCallback("iluhaanime://auth/other#access_token=x")).toBeNull();
    });

    it("rejects missing, blank and overlong tokens", () => {
      expect(parseAnilistAuthCallback("iluhaanime://auth/anilist")).toBeNull();
      expect(parseAnilistAuthCallback("iluhaanime://auth/anilist#token_type=bearer")).toBeNull();
      expect(parseAnilistAuthCallback("iluhaanime://auth/anilist#access_token=%20%20")).toBeNull();
      expect(
        parseAnilistAuthCallback(`iluhaanime://auth/anilist#access_token=${"a".repeat(4097)}`)
      ).toBeNull();
    });

    it("routes the callback through ingest without flagging", () => {
      const authed: string[] = [];
      let invalid = 0;
      ingestDeepLinks(
        ["iluhaanime://auth/anilist#access_token=abc123"],
        () => {},
        () => {
          invalid += 1;
        },
        undefined,
        undefined,
        (link) => {
          authed.push(link.accessToken);
        }
      );
      expect(authed).toEqual(["abc123"]);
      expect(invalid).toBe(0);
    });

    it("flags the callback when no auth handler is wired", () => {
      let invalid = 0;
      ingestDeepLinks(
        ["iluhaanime://auth/anilist#access_token=abc123"],
        () => {},
        () => {
          invalid += 1;
        }
      );
      expect(invalid).toBe(1);
    });
  });

  describe("parseTorrentLink", () => {
    it("parses a valid link and lowercases the hash", () => {
      expect(
        parseTorrentLink("iluhaanime://torrent/ABCDEF0123456789ABCDEF0123456789ABCDEF01")
      ).toEqual({ infoHash: "abcdef0123456789abcdef0123456789abcdef01" });
    });

    it("rejects wrong shape", () => {
      expect(parseTorrentLink("iluhaanime://anime/anilist/21")).toBeNull();
      expect(parseTorrentLink("iluhaanime://torrent/")).toBeNull();
      expect(parseTorrentLink("iluhaanime://torrent/abc")).toBeNull();
      expect(
        parseTorrentLink("iluhaanime://torrent/xyzXYZ0123456789xyzXYZ0123456789xyzXYZ01")
      ).toBeNull();
      expect(
        parseTorrentLink("iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01?x=1")
      ).toBeNull();
    });

    it("round-trips through the builder", () => {
      const hash = "abcdef0123456789abcdef0123456789abcdef01";
      expect(parseTorrentLink(buildTorrentLink(hash as TorrentHash))).toEqual({
        infoHash: hash,
      });
    });

    it("routes torrent links to the torrent opener", () => {
      const openedAnime: AnimeDeepLink[] = [];
      const openedTorrents: { infoHash: string }[] = [];
      let invalid = 0;
      ingestDeepLinks(
        ["iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01"],
        (link) => {
          openedAnime.push(link);
        },
        () => {
          invalid += 1;
        },
        (link) => {
          openedTorrents.push(link);
        }
      );
      expect(openedAnime).toEqual([]);
      expect(openedTorrents).toEqual([{ infoHash: "abcdef0123456789abcdef0123456789abcdef01" }]);
      expect(invalid).toBe(0);
    });

    it("flags torrent links without a torrent opener", () => {
      let invalid = 0;
      ingestDeepLinks(
        ["iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01"],
        () => {},
        () => {
          invalid += 1;
        }
      );
      expect(invalid).toBe(1);
    });
  });

  describe("parsePastedLink", () => {
    it("routes both link kinds", () => {
      expect(parsePastedLink("iluhaanime://anime/anilist/21")).toEqual({
        kind: "anime",
        link: { source: "anilist", id: 21 },
      });
      expect(
        parsePastedLink("iluhaanime://torrent/abcdef0123456789abcdef0123456789abcdef01")
      ).toEqual({
        kind: "torrent",
        link: { infoHash: "abcdef0123456789abcdef0123456789abcdef01" },
      });
    });

    it("ignores non-link text silently", () => {
      expect(parsePastedLink("just some text")).toBeNull();
      expect(parsePastedLink("")).toBeNull();
      expect(parsePastedLink("https://evil.example/anime/21")).toBeNull();
    });

    it("routes magnets to the magnet kind", () => {
      expect(
        parsePastedLink("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01")
      ).toEqual({
        kind: "magnet",
        magnet: "magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01",
      });
    });

    it("routes collection share links to the share kind", () => {
      expect(parsePastedLink("iluhaanime://collection/share/abcDEF123-_")).toEqual({
        kind: "collectionShare",
      });
    });

    it("routes anilist page urls to the anime kind", () => {
      expect(parsePastedLink("https://anilist.co/anime/21/One-Piece")).toEqual({
        kind: "anime",
        link: { source: "anilist", id: 21 },
      });
    });

    it("flags scheme garbage as invalid", () => {
      expect(parsePastedLink("iluhaanime://nope")).toBe("invalid");
    });
  });

  describe("parseAnilistPageUrl", () => {
    it("parses a bare anime page url", () => {
      expect(parseAnilistPageUrl("https://anilist.co/anime/21")).toEqual({
        source: "anilist",
        id: 21,
      });
    });

    it("accepts a slug and a trailing slash", () => {
      expect(parseAnilistPageUrl("https://anilist.co/anime/21/One-Piece")?.id).toBe(21);
      expect(parseAnilistPageUrl("https://anilist.co/anime/21/")?.id).toBe(21);
    });

    it("accepts an uppercase scheme and host", () => {
      expect(parseAnilistPageUrl("HTTPS://ANILIST.CO/anime/21")?.id).toBe(21);
    });

    it("rejects manga paths, bad ids, and query strings", () => {
      expect(parseAnilistPageUrl("https://anilist.co/manga/21")).toBeNull();
      expect(parseAnilistPageUrl("https://anilist.co/anime/0")).toBeNull();
      expect(parseAnilistPageUrl("https://anilist.co/anime/")).toBeNull();
      expect(parseAnilistPageUrl("https://anilist.co/anime/21?ref=home")).toBeNull();
      expect(parseAnilistPageUrl("https://anilist.co/anime/21#frag")).toBeNull();
      expect(parseAnilistPageUrl("http://anilist.co/anime/21")).toBeNull();
      expect(parseAnilistPageUrl("https://www.anilist.co/anime/21")).toBeNull();
      expect(parseAnilistPageUrl("https://evil.example/anime/21")).toBeNull();
      expect(parseAnilistPageUrl("watch https://anilist.co/anime/21")).toBeNull();
      expect(parseAnilistPageUrl("")).toBeNull();
    });
  });

  describe("isEditablePasteTarget", () => {
    it("detects inputs, textareas, and editors", () => {
      expect(isEditablePasteTarget(document.createElement("input"))).toBe(true);
      expect(isEditablePasteTarget(document.createElement("textarea"))).toBe(true);
      const editor = document.createElement("div");
      editor.setAttribute("contenteditable", "true");
      expect(isEditablePasteTarget(editor)).toBe(true);
    });

    it("passes buttons and null through", () => {
      expect(isEditablePasteTarget(document.createElement("button"))).toBe(false);
      expect(isEditablePasteTarget(document.createElement("div"))).toBe(false);
      expect(isEditablePasteTarget(null)).toBe(false);
    });
  });
});

describe("utils/deeplink-share", () => {
  function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
    return {
      id: "id-1",
      title: "Frieren",
      altTitles: [],
      type: "anime",
      status: "planning",
      progressValue: 0,
      progressTotal: 28,
      progressUnit: "episodes",
      durationMinutes: 24,
      rating: null,
      priority: "normal",
      isFavorite: false,
      year: 2023,
      releaseDate: null,
      genres: [],
      studio: null,
      description: null,
      notes: "private note",
      coverUrl: "https://s4.anilist.co/file/frieren.jpg",
      coverBlobId: null,
      thumbBlobId: null,
      externalIds: { anilist: 154587 },
      customFields: {},
      localPath: null,
      localKind: null,
      startedAt: null,
      finishedAt: null,
      lastWatchedAt: null,
      rewatchCount: 0,
      addedAt: 0,
      updatedAt: 0,
      sitesToView: [],
      tvCurrentSeason: null,
      tvCurrentEpisode: null,
      detailsJson: null,
      ...overrides,
    };
  }

  async function gzipToBase64Url(text: string): Promise<string> {
    const compressed = new CompressionStream("gzip");
    const writer = compressed.writable.getWriter();
    const bufferPromise = new Response(compressed.readable).arrayBuffer();
    await writer.write(new TextEncoder().encode(text));
    await writer.close();
    const buffer = await bufferPromise;
    let binary = "";
    for (const byte of new Uint8Array(buffer)) binary += String.fromCodePoint(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/[=]+$/, "");
  }

  async function linkFromPayload(payload: unknown): Promise<string> {
    return `iluhaanime://collection/share/${await gzipToBase64Url(JSON.stringify(payload))}`;
  }

  const slimItem = {
    title: "Frieren",
    type: "anime",
    year: 2023,
    status: "planning",
    externalIds: { anilist: 154587 },
    coverUrl: "https://s4.anilist.co/file/frieren.jpg",
  };

  describe("buildCollectionShareLink", () => {
    it("builds a link with the collection/share prefix and a base64url payload", async () => {
      const link = await buildCollectionShareLink([makeItem()]);
      expect(link.startsWith("iluhaanime://collection/share/")).toBe(true);
      expect(link.slice("iluhaanime://collection/share/".length)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("throws on an empty selection", async () => {
      await expect(buildCollectionShareLink([])).rejects.toThrow(/empty/i);
    });

    it("throws above the parser item cap", async () => {
      const items = Array.from({ length: 501 }, (_, index) =>
        makeItem({ id: `id-${index}`, title: `Title ${index}` })
      );
      await expect(buildCollectionShareLink(items)).rejects.toThrow(/500/);
    });

    it("embeds only the allowlisted slim fields", async () => {
      const link = await buildCollectionShareLink([
        makeItem({
          notes: "secret",
          rating: 9,
          localPath: "D:/anime/frieren",
          description: "long synopsis",
        }),
      ]);
      const parsed = await parseCollectionShareLink(link);
      expect(Object.keys(parsed?.items[0] ?? {}).sort()).toEqual(
        ["coverUrl", "externalIds", "status", "title", "type", "year"].sort()
      );
      expect(parsed?.items[0]).not.toHaveProperty("notes");
      expect(parsed?.items[0]).not.toHaveProperty("localPath");
    });

    it("drops cover urls that are not http(s)", async () => {
      const link = await buildCollectionShareLink([
        makeItem({ coverUrl: "data:image/png;base64,AAAA" }),
      ]);
      const parsed = await parseCollectionShareLink(link);
      expect(parsed?.items[0]?.coverUrl).toBeNull();
    });
  });

  describe("collection share round-trip", () => {
    it("round-trips a snapshot", async () => {
      const link = await buildCollectionShareLink([makeItem()], "Идеи для вечера");
      expect(await parseCollectionShareLink(link)).toEqual({
        version: 1,
        label: "Идеи для вечера",
        items: [slimItem],
      });
    });

    it("preserves order and count", async () => {
      const link = await buildCollectionShareLink([
        makeItem({ id: "a", title: "First" }),
        makeItem({ id: "b", title: "Second" }),
        makeItem({ id: "c", title: "Third" }),
      ]);
      const parsed = await parseCollectionShareLink(link);
      expect(parsed?.items.map((item) => item.title)).toEqual(["First", "Second", "Third"]);
    });

    it("keeps a missing label as null", async () => {
      const link = await buildCollectionShareLink([makeItem()]);
      const parsed = await parseCollectionShareLink(link);
      expect(parsed?.label).toBeNull();
    });

    it("trims surrounding whitespace and accepts an uppercase scheme", async () => {
      const link = await buildCollectionShareLink([makeItem()]);
      const uppercase = `  ${link.replace("iluhaanime", "ILUHAANIME")}  `;
      const parsed = await parseCollectionShareLink(uppercase);
      expect(parsed?.items).toHaveLength(1);
    });

    it("normalizes external ids on the way out", async () => {
      const link = await buildCollectionShareLink([
        makeItem({
          externalIds: { anilist: 154587, mal: 52991, tmdb: 209867, imdb: "tt22248376" },
        }),
      ]);
      const parsed = await parseCollectionShareLink(link);
      expect(parsed?.items[0]?.externalIds).toEqual({
        anilist: 154587,
        mal: 52991,
        tmdb: 209867,
        imdb: "tt22248376",
      });
    });
  });

  describe("parseCollectionShareLink rejections", () => {
    it("rejects empty, blank, and foreign links", async () => {
      expect(await parseCollectionShareLink("")).toBeNull();
      expect(await parseCollectionShareLink("   ")).toBeNull();
      expect(await parseCollectionShareLink("https://example.com")).toBeNull();
      expect(await parseCollectionShareLink("iluhaanime://anime/anilist/21")).toBeNull();
      expect(await parseCollectionShareLink("iluhaanime://collection/other/abc")).toBeNull();
      expect(await parseCollectionShareLink("iluhaanime://collection/share/")).toBeNull();
      expect(await parseCollectionShareLink("xiluhaanime://collection/share/abc")).toBeNull();
    });

    it("rejects a segment with non base64url characters", async () => {
      expect(await parseCollectionShareLink("iluhaanime://collection/share/abc?x=1")).toBeNull();
      expect(await parseCollectionShareLink("iluhaanime://collection/share/abc#frag")).toBeNull();
      expect(await parseCollectionShareLink("iluhaanime://collection/share/a+b/c")).toBeNull();
    });

    it("rejects an oversized segment before decoding it", async () => {
      const huge = "A".repeat(262_145);
      expect(await parseCollectionShareLink(`iluhaanime://collection/share/${huge}`)).toBeNull();
    });

    it("rejects payloads that are not gzip, not JSON, or not the right shape", async () => {
      const notGzip = btoa("hello world").replace(/[=]+$/, "");
      expect(await parseCollectionShareLink(`iluhaanime://collection/share/${notGzip}`)).toBeNull();

      const notJson = `iluhaanime://collection/share/${await gzipToBase64Url("not json")}`;
      expect(await parseCollectionShareLink(notJson)).toBeNull();

      const arrayPayload = `iluhaanime://collection/share/${await gzipToBase64Url("[1,2,3]")}`;
      expect(await parseCollectionShareLink(arrayPayload)).toBeNull();

      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 2, items: [] }))
      ).toBeNull();
      expect(await parseCollectionShareLink(await linkFromPayload({ version: 1 }))).toBeNull();
      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 1, items: "x" }))
      ).toBeNull();
    });

    it("rejects empty and oversized item lists", async () => {
      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [] }))
      ).toBeNull();
      const items = Array.from({ length: 501 }, () => slimItem);
      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 1, items }))
      ).toBeNull();
    });

    it("rejects items missing a required field", async () => {
      const missingTitle = { ...slimItem, title: "" };
      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [missingTitle] }))
      ).toBeNull();

      const badType = { ...slimItem, type: "manga" };
      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [badType] }))
      ).toBeNull();

      const emptyStatus = { ...slimItem, status: "  " };
      expect(
        await parseCollectionShareLink(await linkFromPayload({ version: 1, items: [emptyStatus] }))
      ).toBeNull();

      expect(
        await parseCollectionShareLink(
          await linkFromPayload({ version: 1, items: ["not an object"] })
        )
      ).toBeNull();
    });

    it("rejects when any single item is invalid", async () => {
      const link = await linkFromPayload({
        version: 1,
        items: [slimItem, { ...slimItem, type: "nope" }],
      });
      expect(await parseCollectionShareLink(link)).toBeNull();
    });
  });

  describe("collection share field normalization", () => {
    it("trims and clamps values, and drops invalid ids, year, cover, and imdb", async () => {
      const link = await linkFromPayload({
        version: 1,
        label: "  ",
        items: [
          {
            title: "  Padded Title  ",
            type: "movie",
            year: 12,
            status: "  watching  ",
            externalIds: { anilist: -1, mal: 5, tmdb: "5", imdb: "nope" },
            coverUrl: ["javascript", "alert(1)"].join(":"),
          },
        ],
      });
      expect(await parseCollectionShareLink(link)).toEqual({
        version: 1,
        label: null,
        items: [
          {
            title: "Padded Title",
            type: "movie",
            year: null,
            status: "watching",
            externalIds: { mal: 5 },
            coverUrl: null,
          },
        ],
      });
    });

    it("ignores unknown fields on an item", async () => {
      const link = await linkFromPayload({
        version: 1,
        items: [{ ...slimItem, notes: "leak", localPath: "D:/x" }],
      });
      const parsed = await parseCollectionShareLink(link);
      expect(parsed?.items[0]).toEqual(slimItem);
    });
  });
});

describe("utils/dither", () => {
  const NEUTRAL_OPTIONS: DitherEffectOptions = {
    ...DITHER_DEFAULTS,
    mode: "ordered",
    matrix: "bayer4",
    strength: 0,
    levels: 256,
    palette: [],
    paletteMix: 0,
    monochrome: false,
    contrast: 0,
    grain: 0,
    halftone: 0,
    dotSize: 4,
    dotSoftness: 0,
    glyphs: 0,
    glyphSize: 10,
    scanlines: 0,
    chromatic: 0,
    barrel: 0,
    vignette: 0,
  };

  const BW: DitherRGB[] = [
    [0, 0, 0],
    [255, 255, 255],
  ];

  function grayFrame(values: number[]): Uint8ClampedArray<ArrayBuffer> {
    const pixels = new Uint8ClampedArray(values.length * 4);
    for (let p = 0; p < values.length; p++) {
      const v = values[p] ?? 0;
      pixels[p * 4] = v;
      pixels[p * 4 + 1] = v;
      pixels[p * 4 + 2] = v;
      pixels[p * 4 + 3] = 255;
    }
    return pixels;
  }

  function gradientFixture(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        pixels[i] = Math.round((x / Math.max(1, width - 1)) * 255);
        pixels[i + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
        pixels[i + 2] = 128;
        pixels[i + 3] = 255;
      }
    }
    return pixels;
  }

  describe("clampChannel", () => {
    it("clamps below zero and above 255", () => {
      expect(clampChannel(-12)).toBe(0);
      expect(clampChannel(300)).toBe(255);
    });

    it("passes through in-range values", () => {
      expect(clampChannel(128)).toBe(128);
    });
  });

  describe("lerp", () => {
    it("returns endpoints and midpoint", () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(0, 10, 0.5)).toBe(5);
    });
  });

  describe("hashNoise", () => {
    it("is deterministic for the same coordinates", () => {
      expect(hashNoise(3, 7)).toBe(hashNoise(3, 7));
    });

    it("stays within minus one to one", () => {
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          const value = hashNoise(x, y);
          expect(value).toBeGreaterThanOrEqual(-1);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("smoothNoise", () => {
    it("matches hash noise on integer lattice points", () => {
      expect(smoothNoise(3, 4)).toBe(hashNoise(3, 4));
    });
  });

  describe("luminance", () => {
    it("returns zero for black and full scale for white", () => {
      expect(luminance(0, 0, 0)).toBe(0);
      expect(luminance(255, 255, 255)).toBeCloseTo(255, 8);
    });
  });

  describe("sRGB <-> linear", () => {
    it("roundtrips within one step", () => {
      expect(srgbChannelToLinear(0)).toBe(0);
      expect(linearChannelToSrgb(0)).toBe(0);
      for (const value of [16, 64, 128, 200, 255]) {
        expect(linearChannelToSrgb(srgbChannelToLinear(value))).toBeCloseTo(value, 0);
      }
    });
  });

  describe("nearestPaletteColor", () => {
    it("returns the exact entry on full match", () => {
      expect(nearestPaletteColor(0, 0, 0, BW)).toEqual([0, 0, 0]);
    });

    it("picks the closer entry", () => {
      expect(nearestPaletteColor(200, 200, 200, BW)).toEqual([255, 255, 255]);
      expect(nearestPaletteColor(40, 40, 40, BW)).toEqual([0, 0, 0]);
    });
  });

  describe("nearestPaletteIndexLinear", () => {
    it("finds palette entries by linear distance", () => {
      const linearPalette: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 1],
      ];
      expect(nearestPaletteIndexLinear(102, 102, 102, linearPalette)).toBe(0);
      expect(nearestPaletteIndexLinear(153, 153, 153, linearPalette)).toBe(0);
      expect(nearestPaletteIndexLinear(204, 204, 204, linearPalette)).toBe(1);
    });
  });

  describe("sampleChannel", () => {
    it("clamps out-of-bounds coordinates to the edge pixel", () => {
      const data = new Uint8ClampedArray([10, 20, 30, 40]);
      expect(sampleChannel(data, 1, 1, 5, -3, 0)).toBe(10);
      expect(sampleChannel(data, 1, 1, 0, 0, 3)).toBe(40);
    });

    it("interpolates linearly between two pixels", () => {
      const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255]);
      expect(sampleChannel(data, 2, 1, 0.5, 0, 0)).toBe(127.5);
    });
  });

  describe("matrixThreshold", () => {
    it("returns 64 distinct thresholds in range for the 8x8 Bayer matrix", () => {
      const seen = new Set<number>();
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const value = matrixThreshold(x, y, "bayer8");
          expect(value).toBeGreaterThan(-0.5);
          expect(value).toBeLessThan(0.5);
          seen.add(value);
        }
      }
      expect(seen.size).toBe(64);
    });

    it("keeps thresholds inside the half-open unit range for every matrix", () => {
      for (const matrix of ["bayer4", "bayer8", "blue64"] as const) {
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const value = matrixThreshold(x, y, matrix);
            expect(value).toBeGreaterThanOrEqual(-0.5);
            expect(value).toBeLessThan(0.5);
          }
        }
      }
    });
  });

  describe("renderDitherImage", () => {
    it("keeps neutral pixels unchanged", () => {
      const source = new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255]);
      expect(Array.from(renderDitherImage(source, 2, 1, NEUTRAL_OPTIONS))).toEqual(
        Array.from(source)
      );
    });

    it("does not mutate the source buffer", () => {
      const source = new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255]);
      renderDitherImage(source, 2, 1, NEUTRAL_OPTIONS);
      expect(Array.from(source)).toEqual([10, 20, 30, 255, 200, 150, 100, 255]);
    });

    it("collapses color to a single luminance channel when monochrome", () => {
      const source = new Uint8ClampedArray([100, 150, 200, 255]);
      const output = renderDitherImage(source, 1, 1, {
        ...NEUTRAL_OPTIONS,
        levels: 16,
        monochrome: true,
      });
      expect(output[0]).toBe(output[1]);
      expect(output[1]).toBe(output[2]);
    });

    it("quantizes each color channel to the tone grid", () => {
      const source = new Uint8ClampedArray([40, 130, 210, 255]);
      const output = renderDitherImage(source, 1, 1, { ...NEUTRAL_OPTIONS, levels: 4 });
      expect(Array.from(output)).toEqual([0, 170, 170, 255]);
    });

    it("maps everything to the single palette entry on full palette mix", () => {
      const source = new Uint8ClampedArray([200, 200, 200, 255]);
      const output = renderDitherImage(source, 1, 1, {
        ...NEUTRAL_OPTIONS,
        palette: [[0, 0, 0]],
        paletteMix: 1,
      });
      expect(Array.from(output)).toEqual([0, 0, 0, 255]);
    });

    it("ignores the palette when palette mix is zero", () => {
      const source = new Uint8ClampedArray([200, 200, 200, 255]);
      const output = renderDitherImage(source, 1, 1, {
        ...NEUTRAL_OPTIONS,
        palette: BW,
        paletteMix: 0,
      });
      expect(Array.from(output)).toEqual([200, 200, 200, 255]);
    });

    it("dithers palette boundaries apart at full strength", () => {
      const source = grayFrame([128, 128, 128, 128]);
      const output = renderDitherImage(source, 4, 1, {
        ...NEUTRAL_OPTIONS,
        levels: 3,
        strength: 1,
        matrix: "bayer4",
        palette: BW,
        paletteMix: 1,
      });
      for (let p = 0; p < 4; p++) {
        const value = output[p * 4];
        expect(value === 0 || value === 255).toBe(true);
      }
    });
  });

  describe("error diffusion", () => {
    function diffusionOptions(mode: DitherEffectOptions["mode"]): DitherEffectOptions {
      return {
        ...NEUTRAL_OPTIONS,
        mode,
        strength: 1,
        palette: BW,
        paletteMix: 1,
      };
    }

    it("snaps floyd output to palette entries and preserves alpha", () => {
      const output = renderDitherImage(
        grayFrame([30, 90, 150, 220]),
        4,
        1,
        diffusionOptions("floyd")
      );
      for (let p = 0; p < 4; p++) {
        const pixel = Array.from(output.slice(p * 4, p * 4 + 3));
        expect(pixel).toSatisfy(
          (channels: number[]) => channels.every((c) => c === 0) || channels.every((c) => c === 255)
        );
        expect(output[p * 4 + 3]).toBe(255);
      }
    });

    it("preserves mid tone on flat gray", () => {
      const output = renderDitherImage(
        grayFrame(Array.from({ length: 64 }, () => 128)),
        16,
        4,
        diffusionOptions("floyd")
      );
      let white = 0;
      for (let p = 0; p < 64; p++) {
        if (output[p * 4] === 255) white += 1;
      }
      expect(white).toBeGreaterThanOrEqual(20);
      expect(white).toBeLessThanOrEqual(44);
    });

    it("renders atkinson differently from floyd on a two-dimensional pattern", () => {
      const values: number[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) values.push((x * 32 + y * 17) % 256);
      }
      const floyd = renderDitherImage(grayFrame(values), 8, 8, diffusionOptions("floyd"));
      const atkinson = renderDitherImage(grayFrame(values), 8, 8, diffusionOptions("atkinson"));
      expect(ditherBuffersEqual(floyd, atkinson)).toBe(false);
    });

    it("matches plain nearest when the error scale is zero", () => {
      const output = renderDitherImage(grayFrame([200, 60]), 2, 1, {
        ...diffusionOptions("floyd"),
        strength: 0,
      });
      expect(Array.from(output)).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
    });

    it("falls back to a gray ramp without a palette", () => {
      const output = renderDitherImage(grayFrame([30, 100, 170, 230]), 4, 1, {
        ...diffusionOptions("floyd"),
        palette: [],
        paletteMix: 0,
        levels: 4,
      });
      for (let p = 0; p < 4; p++) {
        expect([0, 85, 170, 255]).toContain(output[p * 4]);
        expect(output[p * 4]).toBe(output[p * 4 + 1]);
        expect(output[p * 4 + 1]).toBe(output[p * 4 + 2]);
      }
    });

    it("stays deterministic across runs on multi-row input", () => {
      const values: number[] = [];
      for (let i = 0; i < 32; i++) values.push((i * 37) % 256);
      const first = renderDitherImage(grayFrame(values), 8, 4, diffusionOptions("floyd"));
      const second = renderDitherImage(grayFrame(values), 8, 4, diffusionOptions("floyd"));
      expect(ditherBuffersEqual(first, second)).toBe(true);
    });
  });

  describe("ditherCacheKey", () => {
    it("is stable for identical inputs", () => {
      expect(ditherCacheKey("a.jpg", 0.5, NEUTRAL_OPTIONS)).toBe(
        ditherCacheKey("a.jpg", 0.5, NEUTRAL_OPTIONS)
      );
    });

    it("changes when the source, scale, or an option changes", () => {
      const base = ditherCacheKey("a.jpg", 0.5, NEUTRAL_OPTIONS);
      expect(ditherCacheKey("b.jpg", 0.5, NEUTRAL_OPTIONS)).not.toBe(base);
      expect(ditherCacheKey("a.jpg", 0.25, NEUTRAL_OPTIONS)).not.toBe(base);
      expect(ditherCacheKey("a.jpg", 0.5, { ...NEUTRAL_OPTIONS, grain: 0.9 })).not.toBe(base);
    });
  });

  describe("ditherBuffersEqual", () => {
    it("matches identical buffers", () => {
      expect(
        ditherBuffersEqual(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 3]))
      ).toBe(true);
    });

    it("rejects different length or content", () => {
      expect(
        ditherBuffersEqual(new Uint8ClampedArray([1, 2]), new Uint8ClampedArray([1, 2, 3]))
      ).toBe(false);
      expect(
        ditherBuffersEqual(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 4]))
      ).toBe(false);
    });
  });

  describe("renderDitherImage bands", () => {
    function noisyFrame(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + 11) % 251;
      return pixels;
    }

    it("reports full bands plus a final partial band", () => {
      const seen: number[] = [];
      const height = DITHER_BAND_ROWS * 2 + 7;
      renderDitherImage(noisyFrame(3, height), 3, height, NEUTRAL_OPTIONS, (done) => {
        seen.push(done);
      });
      expect(seen).toEqual([DITHER_BAND_ROWS, DITHER_BAND_ROWS * 2, height]);
    });

    it("reports once for frames shorter than a band", () => {
      const seen: number[] = [];
      renderDitherImage(noisyFrame(2, 3), 2, 3, NEUTRAL_OPTIONS, (done) => {
        seen.push(done);
      });
      expect(seen).toEqual([3]);
    });

    it("renders identical bytes with and without the callback", () => {
      const height = DITHER_BAND_ROWS + 5;
      const plain = renderDitherImage(noisyFrame(4, height), 4, height, DITHER_DEFAULTS);
      let calls = 0;
      const banded = renderDitherImage(noisyFrame(4, height), 4, height, DITHER_DEFAULTS, () => {
        calls += 1;
      });
      expect(calls).toBe(2);
      expect(ditherBuffersEqual(plain, banded)).toBe(true);
    });
  });

  describe("subscribeWorkerJob", () => {
    function installFakeWorker() {
      const added: Array<[string, unknown]> = [];
      const removed: Array<[string, unknown]> = [];
      const worker = {
        addEventListener: (type: string, listener: unknown) => {
          added.push([type, listener]);
        },
        removeEventListener: (type: string, listener: unknown) => {
          removed.push([type, listener]);
        },
      } as unknown as Worker;
      return { worker, added, removed };
    }

    it("routes progress and result to their handlers and removes them on unsubscribe", () => {
      const { worker, added, removed } = installFakeWorker();
      const onResult = vi.fn();
      const onError = vi.fn();
      const onProgress = vi.fn();
      const unsubscribe = subscribeWorkerJob(worker, onResult, onError, onProgress);
      expect(added[0][0]).toBe("message");
      expect(added[1]).toEqual(["error", onError]);
      const dispatch = added[0][1] as (event: { data: unknown }) => void;
      dispatch({ data: { type: "progress", id: 7, done: 64, total: 130 } });
      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onResult).not.toHaveBeenCalled();
      dispatch({
        data: { type: "result", id: 7, width: 1, height: 1, pixels: new ArrayBuffer(4) },
      });
      expect(onResult).toHaveBeenCalledTimes(1);
      unsubscribe();
      expect(removed).toHaveLength(2);
    });

    it("works without a progress handler", () => {
      const { worker } = installFakeWorker();
      const onResult = vi.fn();
      const unsubscribe = subscribeWorkerJob(worker, onResult, vi.fn());
      expect(() => unsubscribe()).not.toThrow();
      expect(onResult).not.toHaveBeenCalled();
    });
  });

  describe("dither render cache", () => {
    beforeEach(() => {
      ditherRenderCache.clear();
    });

    it("returns stored entries by key", () => {
      const pixels = new Uint8ClampedArray([1, 2, 3, 255]);
      ditherRenderCache.set("k", { width: 1, height: 1, pixels });
      expect(ditherRenderCache.get("k")?.pixels).toEqual(pixels);
      expect(ditherRenderCache.get("missing")).toBeUndefined();
    });

    it("evicts the oldest entry beyond capacity", () => {
      for (let n = 0; n <= DITHER_RENDER_CACHE_CAPACITY; n++) {
        ditherRenderCache.set(`k${n}`, {
          width: 1,
          height: 1,
          pixels: new Uint8ClampedArray([n, 0, 0, 255]),
        });
      }
      expect(ditherRenderCache.get("k0")).toBeUndefined();
      expect(ditherRenderCache.get(`k${DITHER_RENDER_CACHE_CAPACITY}`)?.pixels[0]).toBe(
        DITHER_RENDER_CACHE_CAPACITY
      );
    });

    it("round-trips a rendered image", () => {
      const source = new Uint8ClampedArray([200, 200, 200, 255]);
      const key = ditherCacheKey("r.jpg", 1, NEUTRAL_OPTIONS);
      const pixels = renderDitherImage(source, 1, 1, NEUTRAL_OPTIONS);
      ditherRenderCache.set(key, { width: 1, height: 1, pixels });
      const hit = ditherRenderCache.get(key);
      expect(hit && ditherBuffersEqual(hit.pixels, pixels)).toBe(true);
    });
  });

  describe("tonal shaping", () => {
    const gray = (value: number) => new Uint8ClampedArray([value, value, value, 255]);

    it("steepens the curve at positive contrast", () => {
      const source = new Uint8ClampedArray([64, 64, 64, 255, 192, 192, 192, 255]);
      const out = renderDitherImage(source, 2, 1, { ...NEUTRAL_OPTIONS, contrast: 1 });
      expect(out[0]).toBeLessThan(64);
      expect(out[4]).toBeGreaterThan(192);
    });

    it("flattens the curve at negative contrast", () => {
      const out = renderDitherImage(gray(64), 1, 1, { ...NEUTRAL_OPTIONS, contrast: -1 });
      expect(out[0]).toBeGreaterThan(64);
    });

    it("leaves neutral frames untouched at zero contrast", () => {
      const out = renderDitherImage(gray(128), 1, 1, { ...NEUTRAL_OPTIONS, contrast: 0 });
      expect(out[0]).toBe(128);
    });

    it("adds deterministic grain", () => {
      const source = gradientFixture(16, 16);
      const plain = renderDitherImage(source, 16, 16, NEUTRAL_OPTIONS);
      const first = renderDitherImage(source, 16, 16, { ...NEUTRAL_OPTIONS, grain: 0.8 });
      const second = renderDitherImage(source, 16, 16, { ...NEUTRAL_OPTIONS, grain: 0.8 });
      expect(ditherBuffersEqual(plain, first)).toBe(false);
      expect(ditherBuffersEqual(first, second)).toBe(true);
    });

    it("darkens the corners with a vignette", () => {
      const source = gradientFixture(16, 16);
      const out = renderDitherImage(source, 16, 16, { ...NEUTRAL_OPTIONS, vignette: 1 });
      const corner = out[0];
      const center = out[(8 * 16 + 8) * 4];
      expect(corner).toBeLessThan(center);
    });

    it("darkens alternating rows with scanlines", () => {
      const flat = new Uint8ClampedArray(2 * 2 * 4).fill(200);
      const out = renderDitherImage(flat, 2, 2, { ...NEUTRAL_OPTIONS, scanlines: 1 });
      expect(out[0]).toBe(200);
      expect(out[1 * 2 * 4]).toBeLessThan(200);
    });
  });

  describe("geometry stages", () => {
    it("leaves the frame unchanged when barrel and chromatic are zero", () => {
      const input = gradientFixture(16, 16);
      const output = renderDitherImage(input, 16, 16, NEUTRAL_OPTIONS);
      expect(ditherBuffersEqual(output, input)).toBe(true);
    });

    it("remaps the frame when barrel is set", () => {
      const input = gradientFixture(32, 32);
      const output = renderDitherImage(input, 32, 32, { ...NEUTRAL_OPTIONS, barrel: 0.5 });
      expect(ditherBuffersEqual(output, input)).toBe(false);
    });

    it("splits channels when chromatic is set", () => {
      const input = gradientFixture(32, 32);
      const output = renderDitherImage(input, 32, 32, { ...NEUTRAL_OPTIONS, chromatic: 1 });
      expect(ditherBuffersEqual(output, input)).toBe(false);
    });

    it("renders deterministically for the same geometry", () => {
      const input = gradientFixture(32, 32);
      const options = { ...NEUTRAL_OPTIONS, barrel: 0.3, chromatic: 0.8 };
      const first = renderDitherImage(input, 32, 32, options);
      const second = renderDitherImage(input, 32, 32, options);
      expect(ditherBuffersEqual(first, second)).toBe(true);
    });
  });

  describe("applyHalftoneDots", () => {
    it("covers black cells fully with the sampled dot color", () => {
      const source = new Uint8ClampedArray([
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      ]);
      const output = applyHalftoneDots(source, 2, 2, 2, 0, [255, 255, 255]);
      expect(Array.from(output)).toEqual(Array.from(source));
    });

    it("fills white cells with the paper color", () => {
      const source = new Uint8ClampedArray([
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]);
      const output = applyHalftoneDots(source, 2, 2, 2, 0, [10, 20, 30]);
      expect(Array.from(output)).toEqual([
        10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255,
      ]);
    });

    it("centers monochrome dots on the cell average", () => {
      const row = [128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255];
      const source = new Uint8ClampedArray([...row, ...row, ...row, ...row]);
      const output = applyHalftoneDots(source, 4, 4, 4, 0, [255, 255, 255]);
      expect(Array.from(output.slice(0, 3))).toEqual([255, 255, 255]);
      expect(Array.from(output.slice((2 * 4 + 2) * 4, (2 * 4 + 2) * 4 + 3))).toEqual([
        128, 128, 128,
      ]);
    });

    it("blends the transition band when softness is set", () => {
      const row = [128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255];
      const source = new Uint8ClampedArray([...row, ...row, ...row, ...row]);
      const hard = applyHalftoneDots(source, 4, 4, 4, 0, [255, 255, 255]);
      const soft = applyHalftoneDots(source, 4, 4, 4, 1, [255, 255, 255]);
      expect(hard[(2 * 4 + 2) * 4]).toBe(128);
      const blended = soft[(2 * 4 + 2) * 4];
      expect(blended).toBeGreaterThan(128);
      expect(blended).toBeLessThan(255);
    });

    it("preserves alpha and leaves the input buffer untouched", () => {
      const source = new Uint8ClampedArray([0, 0, 0, 100, 255, 255, 255, 200]);
      const before = Array.from(source);
      const output = applyHalftoneDots(source, 2, 1, 2, 0, [255, 255, 255]);
      expect(Array.from(source)).toEqual(before);
      expect(output[3]).toBe(100);
      expect(output[7]).toBe(200);
    });
  });

  describe("halftone stage in the pipeline", () => {
    it("stays inert when the dot screen is off", () => {
      const source = gradientFixture(16, 16);
      const plain = renderDitherImage(source, 16, 16, NEUTRAL_OPTIONS);
      const sized = renderDitherImage(source, 16, 16, {
        ...NEUTRAL_OPTIONS,
        halftone: 0,
        dotSize: 4,
        dotSoftness: 0,
      });
      expect(ditherBuffersEqual(plain, sized)).toBe(true);
    });

    it("changes the frame once the dot screen is enabled", () => {
      const source = gradientFixture(16, 16);
      const plain = renderDitherImage(source, 16, 16, NEUTRAL_OPTIONS);
      const dotted = renderDitherImage(source, 16, 16, {
        ...NEUTRAL_OPTIONS,
        halftone: 1,
        dotSize: 4,
        dotSoftness: 0,
      });
      expect(ditherBuffersEqual(plain, dotted)).toBe(false);
    });
  });

  describe("applyGlyphOverlay", () => {
    function solidFrame(
      value: number,
      width: number,
      height: number
    ): Uint8ClampedArray<ArrayBuffer> {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
        pixels[i + 3] = 255;
      }
      return pixels;
    }

    function glyphOptions(overrides: Partial<DitherEffectOptions>): DitherEffectOptions {
      return {
        ...NEUTRAL_OPTIONS,
        glyphs: 1,
        glyphSize: 8,
        palette: BW,
        ...overrides,
      };
    }

    it("copies the frame without mutating the input when the stage is off", () => {
      const source = solidFrame(128, 8, 8);
      const before = Array.from(source);
      const output = applyGlyphOverlay(source, 8, 8, glyphOptions({ glyphs: 0 }));
      expect(Array.from(source)).toEqual(before);
      expect(ditherBuffersEqual(output, source)).toBe(true);
    });

    it("leaves dark cells empty", () => {
      const source = solidFrame(0, 16, 16);
      const output = applyGlyphOverlay(source, 16, 16, glyphOptions({}));
      expect(ditherBuffersEqual(output, source)).toBe(true);
    });

    it("moves drawn cells toward the lightest palette color", () => {
      const source = solidFrame(128, 32, 32);
      const output = applyGlyphOverlay(source, 32, 32, glyphOptions({}));
      let changed = 0;
      for (let i = 0; i < source.length; i += 4) {
        if (output[i] === source[i]) continue;
        changed += 1;
        expect(output[i]).toBeGreaterThan(source[i]);
        expect(output[i]).toBeLessThan(255);
      }
      expect(changed).toBeGreaterThan(8);
    });

    it("scales the drawn glyph with the cell size", () => {
      const source = solidFrame(200, 32, 32);
      const small = applyGlyphOverlay(source, 32, 32, glyphOptions({ glyphSize: 6 }));
      const large = applyGlyphOverlay(source, 32, 32, glyphOptions({ glyphSize: 16 }));
      let smallCells = 0;
      let largeCells = 0;
      for (let i = 0; i < source.length; i += 4) {
        if (small[i] !== source[i]) smallCells += 1;
        if (large[i] !== source[i]) largeCells += 1;
      }
      expect(smallCells).toBeGreaterThan(0);
      expect(largeCells).toBeGreaterThan(0);
      expect(largeCells).not.toBe(smallCells);
    });
  });

  describe("glyph stage in the pipeline", () => {
    it("stays inert when the stage is disabled", () => {
      const source = gradientFixture(16, 16);
      const output = renderDitherImage(source, 16, 16, {
        ...NEUTRAL_OPTIONS,
        glyphs: 0,
        glyphSize: 8,
      });
      expect(ditherBuffersEqual(output, source)).toBe(true);
    });

    it("changes the frame once enabled and renders the same bytes twice", () => {
      const source = gradientFixture(32, 32);
      const options = { ...NEUTRAL_OPTIONS, glyphs: 1, glyphSize: 8 };
      const plain = renderDitherImage(source, 32, 32, NEUTRAL_OPTIONS);
      const first = renderDitherImage(source, 32, 32, options);
      const second = renderDitherImage(source, 32, 32, options);
      expect(ditherBuffersEqual(plain, first)).toBe(false);
      expect(ditherBuffersEqual(first, second)).toBe(true);
    });
  });

  describe("presets", () => {
    it("renders the natural preset visibly different from the bypass", () => {
      const input = gradientFixture(32, 32);
      const bypass = renderDitherImage(input, 32, 32, NEUTRAL_OPTIONS);
      const natural = renderDitherImage(input, 32, 32, resolveDitherPreset("natural"));
      let sum = 0;
      for (let i = 0; i < input.length; i += 4) {
        sum +=
          Math.abs(bypass[i] - natural[i]) +
          Math.abs(bypass[i + 1] - natural[i + 1]) +
          Math.abs(bypass[i + 2] - natural[i + 2]);
      }
      expect(sum / (input.length / 4) / 3).toBeGreaterThan(3);
    });

    it("ships a distinct look for every preset and a bypass for none", () => {
      const input = gradientFixture(48, 48);
      const none = renderDitherImage(input, 48, 48, resolveDitherPreset("none"));
      expect(ditherBuffersEqual(none, input)).toBe(true);
      const looks = [
        "natural",
        "classic",
        "gameboy",
        "duotone",
        "print",
        "crt",
        "glyphs",
        "photo",
      ] as const;
      const rendered = looks.map((id) => renderDitherImage(input, 48, 48, resolveDitherPreset(id)));
      for (const output of rendered) {
        expect(ditherBuffersEqual(output, none)).toBe(false);
      }
      for (let a = 0; a < rendered.length; a++) {
        for (let b = a + 1; b < rendered.length; b++) {
          expect(
            ditherBuffersEqual(rendered[a] as Uint8ClampedArray, rendered[b] as Uint8ClampedArray)
          ).toBe(false);
        }
      }
    });
  });

  describe("extractPaletteFromPixels", () => {
    function rgba(pixels: [number, number, number][], alpha = 255): Uint8ClampedArray {
      const data = new Uint8ClampedArray(pixels.length * 4);
      for (let i = 0; i < pixels.length; i++) {
        const pixel = pixels[i];
        if (!pixel) continue;
        const [r, g, b] = pixel;
        data[i * 4] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = alpha;
      }
      return data;
    }

    it("returns the single average for a solid color", () => {
      const data = rgba([
        [255, 0, 0],
        [255, 0, 0],
        [255, 0, 0],
        [255, 0, 0],
      ]);
      expect(extractPaletteFromPixels(data, 4)).toEqual([[255, 0, 0]]);
    });

    it("splits halves along the widest channel", () => {
      const data = rgba([
        [255, 0, 0],
        [255, 0, 0],
        [255, 0, 0],
        [255, 0, 0],
        [0, 0, 255],
        [0, 0, 255],
        [0, 0, 255],
        [0, 0, 255],
      ]);
      expect(extractPaletteFromPixels(data, 2)).toEqual([
        [0, 0, 255],
        [255, 0, 0],
      ]);
    });

    it("clamps the count to two through eight", () => {
      const pixels: [number, number, number][] = [];
      for (let i = 0; i < 16; i++) pixels.push([i * 16, 0, 0]);
      expect(extractPaletteFromPixels(rgba(pixels), 99).length).toBeLessThanOrEqual(8);
      expect(extractPaletteFromPixels(rgba(pixels), 0).length).toBeGreaterThanOrEqual(2);
    });

    it("skips transparent pixels and empty input", () => {
      expect(extractPaletteFromPixels(rgba([[255, 0, 0]]), 2)).toEqual([[255, 0, 0]]);
      expect(extractPaletteFromPixels(rgba([[255, 0, 0]], 0), 2)).toEqual([]);
      expect(extractPaletteFromPixels(new Uint8ClampedArray(0), 4)).toEqual([]);
    });

    it("drops transparent pixels mixed with opaque ones", () => {
      const data = rgba(
        [
          [255, 0, 0],
          [0, 0, 255],
        ],
        255
      );
      data[7] = 0;
      expect(extractPaletteFromPixels(data, 2)).toEqual([[255, 0, 0]]);
    });

    it("returns one color for a single pixel regardless of count", () => {
      expect(extractPaletteFromPixels(rgba([[10, 20, 30]]), 1)).toEqual([[10, 20, 30]]);
      expect(extractPaletteFromPixels(rgba([[10, 20, 30]]), 8)).toEqual([[10, 20, 30]]);
    });

    it("ignores trailing bytes of a truncated row", () => {
      const full = rgba([
        [255, 0, 0],
        [255, 0, 0],
      ]);
      const truncated = full.slice(0, 7);
      expect(extractPaletteFromPixels(truncated, 2)).toEqual([[255, 0, 0]]);
    });

    it("caps distinct colors at eight boxes", () => {
      const pixels: [number, number, number][] = [];
      for (let i = 0; i < 16; i++) pixels.push([i * 16, 0, 0]);
      expect(extractPaletteFromPixels(rgba(pixels), 8)).toHaveLength(8);
    });
  });
});

describe("utils/image", () => {
  describe("user image icon helpers", () => {
    it("recognizes the user image prefix", () => {
      const icon = `${USER_IMAGE_PREFIX}abc123`;
      expect(isUserImageIcon(icon)).toBe(true);
    });

    it("does not treat built-in icons as user images", () => {
      expect(isUserImageIcon("w2k_globe.ico")).toBe(false);
    });
  });

  describe("asset urls", () => {
    it("leaves a plain path untouched without a version", () => {
      expect(assetUrl("C:/images/aaa.png")).toBe("http://asset.localhost/C%3A%2Fimages%2Faaa.png");
      expect(assetUrl("C:/images/aaa.png", null)).toBe(assetUrl("C:/images/aaa.png"));
      expect(assetUrl("C:/images/aaa.png", "")).toBe(assetUrl("C:/images/aaa.png"));
    });

    it("appends the version so a rewritten file gets a new url", () => {
      const first = assetUrl("C:/images/aaa.png", "100");
      const second = assetUrl("C:/images/aaa.png", "200");
      expect(first).toBe("http://asset.localhost/C%3A%2Fimages%2Faaa.png?v=100");
      expect(second).not.toBe(first);
    });

    it("carries the version into the image url but not the original", () => {
      const image = toUserImage({
        id: "aaa",
        name: "art.png",
        mimeType: "image/png",
        path: "C:/images/aaa.png",
        originalPath: "C:/images/aaa.original.png",
        version: "42",
        createdAt: 10,
      });
      expect(image.url).toContain("?v=42");
      expect(image.originalUrl).not.toContain("v=");
      expect(image.version).toBe("42");
    });

    it("passes the backend source through and defaults it to null", () => {
      const base = {
        id: "aaa",
        name: "art.png",
        mimeType: "image/png",
        path: "C:/images/aaa.png",
        originalPath: null,
        version: null,
        createdAt: 10,
      };
      expect(toUserImage(base).source).toBeNull();
      expect(toUserImage({ ...base, source: "remote" }).source).toBe("remote");
      expect(toUserImage({ ...base, source: "upload" }).source).toBe("upload");
    });
  });
});

describe("utils/keyboard", () => {
  function keyEvent(overrides: Partial<KeyboardEvent<Element>> = {}): KeyboardEvent<Element> {
    return {
      key: "",
      preventDefault: vi.fn(),
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      ...overrides,
    } as unknown as KeyboardEvent<Element>;
  }

  describe("moveIndex", () => {
    it("moves forward and backward with wrap-around", () => {
      expect(moveIndex(0, 1, 3)).toBe(1);
      expect(moveIndex(2, 1, 3)).toBe(0);
      expect(moveIndex(0, -1, 3)).toBe(2);
    });

    it("returns -1 for empty lists", () => {
      expect(moveIndex(0, 1, 0)).toBe(-1);
    });
  });

  describe("createListNavigationHandler", () => {
    it("moves the active index with arrow keys", () => {
      const setActiveIndex = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex,
      });

      const down = keyEvent({ key: "ArrowDown" });
      handler(down);
      expect(down.preventDefault).toHaveBeenCalled();
      expect(setActiveIndex).toHaveBeenCalledWith(1);

      const up = keyEvent({ key: "ArrowUp" });
      handler(up);
      expect(setActiveIndex).toHaveBeenCalledWith(2);
    });

    it("respects a horizontal axis", () => {
      const setActiveIndex = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex,
        axis: "horizontal",
      });

      handler(keyEvent({ key: "ArrowLeft" }));
      expect(setActiveIndex).toHaveBeenCalledWith(2);
      expect(setActiveIndex).not.toHaveBeenCalledWith(1);
    });

    it("handles Home and End", () => {
      const setActiveIndex = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 2,
        setActiveIndex,
      });

      handler(keyEvent({ key: "Home" }));
      expect(setActiveIndex).toHaveBeenLastCalledWith(0);
      handler(keyEvent({ key: "End" }));
      expect(setActiveIndex).toHaveBeenLastCalledWith(2);
    });

    it("fires onEnter with the active index", () => {
      const onEnter = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 1,
        setActiveIndex: vi.fn(),
        onEnter,
      });

      const enter = keyEvent({ key: "Enter" });
      handler(enter);
      expect(enter.preventDefault).toHaveBeenCalled();
      expect(onEnter).toHaveBeenCalledWith(1);
    });

    it("does not fire onEnter when nothing is active", () => {
      const onEnter = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: -1,
        setActiveIndex: vi.fn(),
        onEnter,
      });

      handler(keyEvent({ key: "Enter" }));
      expect(onEnter).not.toHaveBeenCalled();
    });

    it("fires onTab and prevents default on forward Tab with an active item", () => {
      const onTab = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex: vi.fn(),
        onTab,
      });

      const tab = keyEvent({ key: "Tab" });
      handler(tab);
      expect(tab.preventDefault).toHaveBeenCalled();
      expect(onTab).toHaveBeenCalledWith(0);
    });

    it("ignores shift+Tab", () => {
      const onTab = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex: vi.fn(),
        onTab,
      });

      const shiftTab = keyEvent({ key: "Tab", shiftKey: true });
      handler(shiftTab);
      expect(onTab).not.toHaveBeenCalled();
    });

    it("forwards Escape only when onEscape returns true", () => {
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex: vi.fn(),
        onEscape: () => false,
      });

      const escape = keyEvent({ key: "Escape" });
      handler(escape);
      expect(escape.preventDefault).not.toHaveBeenCalled();

      const handlerHandled = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex: vi.fn(),
        onEscape: () => true,
      });

      const handledEscape = keyEvent({ key: "Escape" });
      handlerHandled(handledEscape);
      expect(handledEscape.preventDefault).toHaveBeenCalled();
    });

    it("forwards unhandled keys to onUnhandled", () => {
      const onUnhandled = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex: vi.fn(),
        onUnhandled,
      });

      handler(keyEvent({ key: "x" }));
      expect(onUnhandled).toHaveBeenCalled();
    });

    it("ignores navigation when disabled", () => {
      const setActiveIndex = vi.fn();
      const onUnhandled = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex,
        enabled: false,
        onUnhandled,
      });

      handler(keyEvent({ key: "ArrowDown" }));
      expect(setActiveIndex).not.toHaveBeenCalled();
      expect(onUnhandled).toHaveBeenCalled();
    });

    it("still handles Escape when disabled", () => {
      const setActiveIndex = vi.fn();
      const onUnhandled = vi.fn();
      const handler = createListNavigationHandler({
        count: 3,
        activeIndex: 0,
        setActiveIndex,
        enabled: false,
        onEscape: () => true,
        onUnhandled,
      });

      const escape = keyEvent({ key: "Escape" });
      handler(escape);
      expect(escape.preventDefault).toHaveBeenCalled();
      expect(onUnhandled).not.toHaveBeenCalled();
    });
  });

  describe("enterOrSpace", () => {
    it("activates on Enter and Space, preventing default", () => {
      const onActivate = vi.fn();

      const enter = keyEvent({ key: "Enter" });
      enterOrSpace(onActivate)(enter);
      expect(enter.preventDefault).toHaveBeenCalled();
      expect(onActivate).toHaveBeenCalledTimes(1);

      const space = keyEvent({ key: " " });
      enterOrSpace(onActivate)(space);
      expect(onActivate).toHaveBeenCalledTimes(2);
    });

    it("ignores other keys", () => {
      const onActivate = vi.fn();
      enterOrSpace(onActivate)(keyEvent({ key: "a" }));
      expect(onActivate).not.toHaveBeenCalled();
    });
  });

  describe("enterSubmit", () => {
    it("submits on Enter", () => {
      const onSubmit = vi.fn();
      enterSubmit(onSubmit)(keyEvent({ key: "Enter" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("ignores other keys", () => {
      const onSubmit = vi.fn();
      enterSubmit(onSubmit)(keyEvent({ key: "Escape" }));
      expect(onSubmit).not.toHaveBeenCalled();
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
  const ru = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate("ru", key, vars);

  const en = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate("en", key, vars);

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
      ["tmdb_api_key", true],
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
