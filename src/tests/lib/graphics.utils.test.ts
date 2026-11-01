import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DITHER_BAND_ROWS,
  DITHER_DEFAULTS,
  DITHER_RENDER_CACHE_CAPACITY,
  resolveDitherPreset,
} from "@/config/graphics/dither.config";
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
import type { DitherEffectOptions, DitherRGB } from "@/types/graphics/dither";

vi.mock("@tauri-apps/api/core", async () => {
  const { mockInvoke } = await import("@/tests/mocks");
  return {
    invoke: mockInvoke,
    convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
  };
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
