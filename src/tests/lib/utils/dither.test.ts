import { beforeEach, describe, expect, it, vi } from "vitest";

import { BLUE_NOISE_64 } from "@/config/utils/blueNoise.config";
import {
  DITHER_BAND_ROWS,
  DITHER_DEFAULT_PALETTE,
  DITHER_DEFAULTS,
  DITHER_RED_RAMP_PALETTE,
  DITHER_RENDER_CACHE_CAPACITY,
} from "@/config/utils/dither.config";
import {
  applyHalftoneDots,
  clampChannel,
  darkestPaletteColor,
  ditherBuffersEqual,
  ditherCacheKey,
  ditherRenderCache,
  hashNoise,
  lerp,
  lightestPaletteColor,
  luminance,
  nearestPaletteColor,
  renderDitherImage,
  sampleChannel,
  smoothNoise,
  subscribeWorkerJob,
} from "@/lib/utils/dither.utils";
import type { DitherEffectOptions } from "@/types/dither";

const NEUTRAL_OPTIONS: DitherEffectOptions = {
  ...DITHER_DEFAULTS,
  levels: 256,
  ditherStrength: 0,
  ditherAmount: 1,
  grain: 0,
  texture: 0,
  halftone: 0,
  monochromeNoise: 0,
  ink: 0,
  edgeDistortion: 0,
  misregistration: 0,
  paper: 0,
  vignette: 0,
  paletteBias: 0,
  shadowCrush: 0,
  highlightCompression: 0,
  contrastCurve: 0,
  blackPoint: 0,
  localContrast: 0,
  inkDensity: 0,
};

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
        expect(hashNoise(x, y)).toBeGreaterThanOrEqual(-1);
        expect(hashNoise(x, y)).toBeLessThanOrEqual(1);
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

describe("nearestPaletteColor", () => {
  it("returns the exact entry on full match", () => {
    expect(nearestPaletteColor(18, 18, 18, DITHER_DEFAULT_PALETTE)).toEqual([18, 18, 18]);
  });

  it("picks the closer entry", () => {
    expect(
      nearestPaletteColor(200, 200, 200, [
        [0, 0, 0],
        [255, 255, 255],
      ])
    ).toEqual([255, 255, 255]);
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

  it("maps everything to the single palette entry on full bias", () => {
    const source = new Uint8ClampedArray([200, 200, 200, 255]);
    const output = renderDitherImage(source, 1, 1, {
      ...NEUTRAL_OPTIONS,
      palette: [[0, 0, 0]],
      paletteBias: 1,
    });
    expect(Array.from(output)).toEqual([0, 0, 0, 255]);
  });
});
describe("lightestPaletteColor", () => {
  it("picks the brightest entry", () => {
    expect(
      lightestPaletteColor([
        [0, 0, 0],
        [10, 20, 30],
        [200, 200, 200],
      ])
    ).toEqual([200, 200, 200]);
  });

  it("falls back to white for an empty palette", () => {
    expect(lightestPaletteColor([])).toEqual([255, 255, 255]);
  });
});

describe("applyHalftoneDots", () => {
  it("covers black cells fully with the sampled dot color", () => {
    const source = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
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

  it("centers dots uniformly with symmetric rosette fringe on mid gray", () => {
    const row = [128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255];
    const source = new Uint8ClampedArray([...row, ...row, ...row, ...row]);
    const output = applyHalftoneDots(source, 4, 4, 4, 0, [255, 255, 255]);
    expect(Array.from(output.slice(0, 3))).toEqual([128, 255, 255]);
    expect(Array.from(output.slice((2 * 4 + 2) * 4, (2 * 4 + 2) * 4 + 3))).toEqual([128, 128, 128]);
  });

  it("offsets dot screens per channel like a print rosette", () => {
    const row = [128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255];
    const source = new Uint8ClampedArray([...row, ...row, ...row, ...row]);
    const output = applyHalftoneDots(source, 4, 4, 4, 0, [255, 255, 255]);
    expect(Array.from(output.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 3))).toEqual([255, 255, 128]);
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

  it("stays inert when the dot pass is disabled in the full pipeline", () => {
    const source = new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255]);
    const output = renderDitherImage(source, 2, 1, {
      ...NEUTRAL_OPTIONS,
      halftoneSize: 0,
      halftoneSoftness: 1,
    });
    expect(Array.from(output)).toEqual(Array.from(source));
  });

  it("changes pipeline bytes once the dot pass is enabled", () => {
    const source = new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255]);
    const plain = renderDitherImage(source, 2, 1, NEUTRAL_OPTIONS);
    const dotted = renderDitherImage(source, 2, 1, {
      ...NEUTRAL_OPTIONS,
      palette: [],
      halftoneSize: 2,
      halftoneSoftness: 0,
    });
    expect(ditherBuffersEqual(plain, dotted)).toBe(false);
  });
});
describe("gray grain", () => {
  it("keeps gray pixels gray with a shared threshold", () => {
    const source = new Uint8ClampedArray([
      100, 100, 100, 255, 150, 150, 150, 255, 200, 200, 200, 255, 50, 50, 50, 255,
    ]);
    const output = renderDitherImage(source, 4, 1, {
      ...NEUTRAL_OPTIONS,
      levels: 4,
      ditherStrength: 1,
      ditherMatrix: "blue64",
      palette: [],
      grayGrain: true,
    });
    for (let p = 0; p < 4; p++) {
      expect(output[p * 4]).toBe(output[p * 4 + 1]);
      expect(output[p * 4 + 1]).toBe(output[p * 4 + 2]);
    }
  });

  it("splits channels with decorrelated thresholds", () => {
    const source = new Uint8ClampedArray([
      100, 100, 100, 255, 150, 150, 150, 255, 200, 200, 200, 255, 50, 50, 50, 255,
    ]);
    const gray = renderDitherImage(source, 4, 1, {
      ...NEUTRAL_OPTIONS,
      levels: 4,
      ditherStrength: 1,
      ditherMatrix: "blue64",
      palette: [],
      grayGrain: true,
    });
    const color = renderDitherImage(source, 4, 1, {
      ...NEUTRAL_OPTIONS,
      levels: 4,
      ditherStrength: 1,
      ditherMatrix: "blue64",
      palette: [],
      grayGrain: false,
    });
    expect(ditherBuffersEqual(gray, color)).toBe(false);
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
    expect(ditherCacheKey("a.jpg", 0.5, { ...NEUTRAL_OPTIONS, grain: 9 })).not.toBe(base);
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
    dispatch({ data: { type: "result", id: 7, width: 1, height: 1, pixels: new ArrayBuffer(4) } });
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

  it("clears the frame at full black point", () => {
    const out = renderDitherImage(gray(200), 1, 1, { ...NEUTRAL_OPTIONS, blackPoint: 1 });
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
  });

  it("leaves white untouched while crushing dark grays", () => {
    const dark = renderDitherImage(gray(40), 1, 1, { ...NEUTRAL_OPTIONS, shadowCrush: 1 });
    expect(dark[0]).toBeLessThan(40);
    const white = renderDitherImage(gray(255), 1, 1, { ...NEUTRAL_OPTIONS, shadowCrush: 1 });
    expect([white[0], white[1], white[2]]).toEqual([255, 255, 255]);
  });

  it("pulls the ends of the S-curve apart", () => {
    const source = new Uint8ClampedArray([64, 64, 64, 255, 192, 192, 192, 255]);
    const out = renderDitherImage(source, 2, 1, { ...NEUTRAL_OPTIONS, contrastCurve: 1 });
    expect(out[0]).toBeLessThan(64);
    expect(out[4]).toBeGreaterThan(192);
  });

  it("compresses near-white while holding midtones", () => {
    const hot = renderDitherImage(gray(230), 1, 1, { ...NEUTRAL_OPTIONS, highlightCompression: 1 });
    expect(hot[0]).toBeLessThan(230);
    const mid = renderDitherImage(gray(128), 1, 1, { ...NEUTRAL_OPTIONS, highlightCompression: 1 });
    expect(mid[0]).toBe(128);
  });

  it("pushes local detail away from the neighborhood mean", () => {
    const source = new Uint8ClampedArray([200, 200, 200, 255, 50, 50, 50, 255, 200, 200, 200, 255]);
    const flat = renderDitherImage(source, 3, 1, NEUTRAL_OPTIONS);
    const boosted = renderDitherImage(source, 3, 1, { ...NEUTRAL_OPTIONS, localContrast: 1 });
    expect(flat[4]).toBe(50);
    expect(boosted[4]).toBeLessThan(50);
  });

  it("pulls dark pixels toward the darkest palette color", () => {
    const darkest = darkestPaletteColor(DITHER_RED_RAMP_PALETTE);
    const out = renderDitherImage(gray(30), 1, 1, { ...NEUTRAL_OPTIONS, inkDensity: 1 });
    expect(out[0]).toBeLessThan(30);
    expect(out[0]).toBeGreaterThanOrEqual(darkest[0]);
  });

  it("weights ink noise toward midtones instead of shadows", () => {
    const inked = { ...NEUTRAL_OPTIONS, ink: 8 };
    const dark = renderDitherImage(new Uint8ClampedArray([10, 10, 10, 255]), 1, 1, inked);
    const mid = renderDitherImage(new Uint8ClampedArray([128, 128, 128, 255]), 1, 1, inked);
    expect(Math.abs(mid[0] - 128)).toBeGreaterThan(Math.abs(dark[0] - 10));
  });

  it("matches pure posterize at zero amount", () => {
    const source = new Uint8ClampedArray([100, 150, 200, 255]);
    const blended = renderDitherImage(source, 1, 1, {
      ...NEUTRAL_OPTIONS,
      ditherStrength: 1,
      ditherAmount: 0,
    });
    const plain = renderDitherImage(source, 1, 1, NEUTRAL_OPTIONS);
    expect(blended[0]).toBe(plain[0]);
    expect(blended[1]).toBe(plain[1]);
    expect(blended[2]).toBe(plain[2]);
  });

  it("renders different but deterministic output per matrix", () => {
    const source = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        const v = Math.round((x / 7) * 200);
        source[i] = v;
        source[i + 1] = v;
        source[i + 2] = v;
        source[i + 3] = 255;
      }
    }
    const blue = {
      ...NEUTRAL_OPTIONS,
      levels: 8,
      ditherStrength: 1,
      ditherMatrix: "blue64" as const,
    };
    const first = renderDitherImage(source, 8, 8, blue);
    const second = renderDitherImage(source, 8, 8, blue);
    expect(ditherBuffersEqual(first, second)).toBe(true);
    const bayer = renderDitherImage(source, 8, 8, {
      ...NEUTRAL_OPTIONS,
      levels: 8,
      ditherStrength: 1,
    });
    expect(ditherBuffersEqual(first, bayer)).toBe(false);
    expect(ditherCacheKey("a.jpg", 0.5, blue)).not.toBe(
      ditherCacheKey("a.jpg", 0.5, NEUTRAL_OPTIONS)
    );
  });

  it("ships a full blue noise permutation", () => {
    expect(BLUE_NOISE_64).toHaveLength(4096);
    expect(new Set(BLUE_NOISE_64).size).toBe(4096);
    expect(Math.min(...BLUE_NOISE_64)).toBe(0);
    expect(Math.max(...BLUE_NOISE_64)).toBe(4095);
  });
});
