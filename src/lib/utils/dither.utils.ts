import { BLUE_NOISE_64, BLUE_NOISE_RANGE, BLUE_NOISE_SIZE } from "@/config/utils/blueNoise.config";
import {
  DITHER_BAND_ROWS,
  DITHER_BAYER_4,
  DITHER_BAYER_RANGE,
  DITHER_BAYER_SIZE,
  DITHER_CHANNEL_SHIFT,
  DITHER_DECODE_CACHE_CAPACITY,
  DITHER_DEFAULTS,
  DITHER_DOT_CELL,
  DITHER_EDGE_LATTICE,
  DITHER_EDGE_OFFSET,
  DITHER_GRAIN_FREQUENCY,
  DITHER_INK_FREQUENCY,
  DITHER_LOCAL_TAP,
  DITHER_LUMINANCE_BLUE,
  DITHER_LUMINANCE_GREEN,
  DITHER_LUMINANCE_RED,
  DITHER_MACRO_LATTICE,
  DITHER_MONO_FINE_SHARE,
  DITHER_NOISE_GAIN,
  DITHER_NOISE_X,
  DITHER_NOISE_Y,
  DITHER_PAPER_LATTICE,
  DITHER_PAPER_OFFSET,
  DITHER_RENDER_CACHE_CAPACITY,
  DITHER_ROSETTE_SHIFT,
  DITHER_ROSETTE_VECTORS,
  DITHER_TEXTURE_LATTICE,
} from "@/config/utils/dither.config";
import { attemptSync } from "@/lib/utils/attempt.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";
import type {
  DitherCacheEntry,
  DitherEffectOptions,
  DitherRGB,
  DitherWorkerProgress,
  DitherWorkerResponse,
} from "@/types/dither";

export function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

export function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

export function hashNoise(x: number, y: number): number {
  const n = Math.sin(x * DITHER_NOISE_X + y * DITHER_NOISE_Y) * DITHER_NOISE_GAIN;
  return (n - Math.floor(n)) * 2 - 1;
}

export function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const n00 = hashNoise(x0, y0);
  const n10 = hashNoise(x0 + 1, y0);
  const n01 = hashNoise(x0, y0 + 1);
  const n11 = hashNoise(x0 + 1, y0 + 1);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

export function luminance(r: number, g: number, b: number): number {
  return r * DITHER_LUMINANCE_RED + g * DITHER_LUMINANCE_GREEN + b * DITHER_LUMINANCE_BLUE;
}

export function darkestPaletteColor(palette: readonly DitherRGB[]): DitherRGB {
  let darkest: DitherRGB = [0, 0, 0];
  let lowest = Infinity;
  for (const color of palette) {
    const level = luminance(color[0], color[1], color[2]);
    if (level < lowest) {
      lowest = level;
      darkest = color;
    }
  }
  return darkest;
}

export function lightestPaletteColor(palette: readonly DitherRGB[]): DitherRGB {
  let lightest: DitherRGB = [255, 255, 255];
  let highest = -Infinity;
  for (const color of palette) {
    const level = luminance(color[0], color[1], color[2]);
    if (level > highest) {
      highest = level;
      lightest = color;
    }
  }
  return lightest;
}

export function applyHalftoneDots(
  image: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  size: number,
  softness: number,
  paper: DitherRGB
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(image);
  const cell = Math.max(1, size);
  const soft = Math.max(0, softness);
  const cover = cell * Math.SQRT1_2;
  for (let originY = 0; originY < height; originY += cell) {
    for (let originX = 0; originX < width; originX += cell) {
      const centerX = originX + cell / 2;
      const centerY = originY + cell / 2;
      const sample =
        (Math.min(height - 1, Math.floor(centerY)) * width +
          Math.min(width - 1, Math.floor(centerX))) *
        4;
      const dot: [number, number, number] = [image[sample], image[sample + 1], image[sample + 2]];
      const radius = (1 - luminance(dot[0], dot[1], dot[2]) / 255) * cover;
      const endX = Math.min(width, originX + cell);
      const endY = Math.min(height, originY + cell);
      const shift = cell * DITHER_ROSETTE_SHIFT;
      const dotRadius = radius * (1 + shift / cover);
      for (let y = Math.round(originY); y < endY; y++) {
        for (let x = Math.round(originX); x < endX; x++) {
          const o = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            const direction = DITHER_ROSETTE_VECTORS[channel];
            const dx = x + 0.5 - (centerX + direction[0] * shift);
            const dy = y + 0.5 - (centerY + direction[1] * shift);
            const coverage = halftoneCoverage(dx * dx + dy * dy, dotRadius, soft);
            output[o + channel] = lerp(paper[channel], dot[channel], coverage);
          }
        }
      }
    }
  }
  return output;
}

export function localDetail(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      r += sampleChannel(
        data,
        width,
        height,
        x + dx * DITHER_LOCAL_TAP,
        y + dy * DITHER_LOCAL_TAP,
        0
      );
      g += sampleChannel(
        data,
        width,
        height,
        x + dx * DITHER_LOCAL_TAP,
        y + dy * DITHER_LOCAL_TAP,
        1
      );
      b += sampleChannel(
        data,
        width,
        height,
        x + dx * DITHER_LOCAL_TAP,
        y + dy * DITHER_LOCAL_TAP,
        2
      );
    }
  }
  const i = (y * width + x) * 4;
  return [data[i] - r / 9, data[i + 1] - g / 9, data[i + 2] - b / 9];
}

export function nearestPaletteColor(
  r: number,
  g: number,
  b: number,
  palette: readonly DitherRGB[]
): DitherRGB {
  let best = palette[0];
  let bestDistance = Infinity;
  for (const color of palette) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best;
}

export function sampleChannel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number
): number {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;
  const i00 = (y0 * width + x0) * 4 + channel;
  const i10 = (y0 * width + x1) * 4 + channel;
  const i01 = (y1 * width + x0) * 4 + channel;
  const i11 = (y1 * width + x1) * 4 + channel;
  const top = lerp(data[i00], data[i10], tx);
  const bottom = lerp(data[i01], data[i11], tx);
  return lerp(top, bottom, ty);
}

function reportBandProgress(
  onBand: ((doneRows: number) => void) | undefined,
  rowIndex: number,
  height: number
): void {
  if (onBand === undefined) return;
  const doneRows = rowIndex + 1;
  if (doneRows % DITHER_BAND_ROWS === 0 || doneRows === height) onBand(doneRows);
}

function finishDitherImage(
  output: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  options: DitherEffectOptions
): Uint8ClampedArray<ArrayBuffer> {
  if (options.halftoneSize <= 0) return output;
  const paper =
    options.palette.length > 0
      ? lightestPaletteColor(options.palette)
      : ([255, 255, 255] as DitherRGB);
  return applyHalftoneDots(
    output,
    width,
    height,
    options.halftoneSize,
    options.halftoneSoftness,
    paper
  );
}

function matrixThreshold(x: number, y: number, matrix: "bayer4" | "blue64"): number {
  if (matrix === "blue64") {
    return (
      (BLUE_NOISE_64[((y & (BLUE_NOISE_SIZE - 1)) << 6) + (x & (BLUE_NOISE_SIZE - 1))] + 0.5) /
        BLUE_NOISE_RANGE -
      0.5
    );
  }
  return (
    (DITHER_BAYER_4[((y & (DITHER_BAYER_SIZE - 1)) << 2) + (x & (DITHER_BAYER_SIZE - 1))] + 0.5) /
      DITHER_BAYER_RANGE -
    0.5
  );
}

function channelThresholds(
  target: [number, number, number],
  x: number,
  y: number,
  options: DitherEffectOptions,
  step: number
): void {
  const matrix = options.ditherMatrix;
  const strength = options.ditherStrength;
  if (options.grayGrain) {
    const variation =
      hashNoise(Math.floor(x / DITHER_DOT_CELL), Math.floor(y / DITHER_DOT_CELL)) *
      options.halftone;
    const ordered = (matrixThreshold(x, y, matrix) + variation) * step * strength;
    target[0] = ordered;
    target[1] = ordered;
    target[2] = ordered;
    return;
  }
  for (let channel = 0; channel < 3; channel++) {
    const shift = DITHER_CHANNEL_SHIFT[channel];
    const variation =
      hashNoise(
        Math.floor((x + shift[0]) / DITHER_DOT_CELL),
        Math.floor((y + shift[1]) / DITHER_DOT_CELL)
      ) * options.halftone;
    target[channel] =
      (matrixThreshold(x + shift[0], y + shift[1], matrix) + variation) * step * strength;
  }
}

function halftoneCoverage(distance2: number, radius: number, soft: number): number {
  if (soft <= 0) return distance2 <= radius * radius ? 1 : 0;
  const inner = Math.max(0, radius - soft);
  const outer = radius + soft;
  if (distance2 <= inner * inner) return 1;
  if (distance2 >= outer * outer) return 0;
  const t = (Math.sqrt(distance2) - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t);
}

export function renderDitherImage(
  source: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  options: DitherEffectOptions,
  onBand?: (doneRows: number) => void
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(source);
  const orderedSteps: [number, number, number] = [0, 0, 0];
  const step = 255 / Math.max(1, options.levels - 1);
  const inkTarget = darkestPaletteColor(options.palette);
  const usePalette = options.palette.length > 0;
  const shift = options.misregistration;
  const keepBlack = 1 - Math.min(1, options.blackPoint);
  const curveAmount = Math.min(1, options.contrastCurve);
  const crushBase = Math.min(1, options.shadowCrush);
  const squeezeBase = Math.min(1, options.highlightCompression);
  const localBoost = Math.min(1, options.localContrast);
  const inkDensity = Math.min(1, options.inkDensity);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const distortionX =
        smoothNoise(x / DITHER_EDGE_LATTICE, y / DITHER_EDGE_LATTICE) * options.edgeDistortion;
      const distortionY =
        smoothNoise(
          x / DITHER_EDGE_LATTICE + DITHER_EDGE_OFFSET,
          y / DITHER_EDGE_LATTICE + DITHER_EDGE_OFFSET
        ) * options.edgeDistortion;
      const rx = shift;
      const bx = -shift;
      let r = sampleChannel(source, width, height, x + distortionX + rx, y + distortionY, 0);
      let g = sampleChannel(source, width, height, x + distortionX, y + distortionY, 1);
      let b = sampleChannel(source, width, height, x + distortionX + bx, y + distortionY, 2);
      let monoAdd = 0;
      let texAdd = 0;
      if (options.monochromeNoise !== 0 || options.grain !== 0 || options.texture !== 0) {
        const fineNoise = hashNoise(x, y);
        const largeNoise = smoothNoise(x / DITHER_MACRO_LATTICE, y / DITHER_MACRO_LATTICE);
        monoAdd =
          fineNoise * options.monochromeNoise * DITHER_MONO_FINE_SHARE +
          largeNoise * options.monochromeNoise * (1 - DITHER_MONO_FINE_SHARE);
        const fineGrain =
          hashNoise(x * DITHER_GRAIN_FREQUENCY, y * DITHER_GRAIN_FREQUENCY) * options.grain;
        const largeTexture =
          smoothNoise(x / DITHER_TEXTURE_LATTICE, y / DITHER_TEXTURE_LATTICE) * options.texture;
        texAdd = fineGrain + largeTexture;
      }
      r += monoAdd;
      g += monoAdd;
      b += monoAdd;
      r += texAdd;
      g += texAdd;
      b += texAdd;
      if (options.blackPoint > 0) {
        r *= keepBlack;
        g *= keepBlack;
        b *= keepBlack;
      }
      if (options.contrastCurve > 0) {
        const rt = Math.max(0, Math.min(1, r / 255));
        const gt = Math.max(0, Math.min(1, g / 255));
        const bt = Math.max(0, Math.min(1, b / 255));
        r = lerp(r, rt * rt * (3 - 2 * rt) * 255, curveAmount);
        g = lerp(g, gt * gt * (3 - 2 * gt) * 255, curveAmount);
        b = lerp(b, bt * bt * (3 - 2 * bt) * 255, curveAmount);
      }
      if (options.shadowCrush > 0) {
        r *= 1 - crushBase * (1 - r / 255) * (1 - r / 255);
        g *= 1 - crushBase * (1 - g / 255) * (1 - g / 255);
        b *= 1 - crushBase * (1 - b / 255) * (1 - b / 255);
      }
      if (options.highlightCompression > 0) {
        const rOver = Math.max(0, r / 255 - 0.7) / 0.3;
        const gOver = Math.max(0, g / 255 - 0.7) / 0.3;
        const bOver = Math.max(0, b / 255 - 0.7) / 0.3;
        r -= squeezeBase * rOver * rOver * 255 * 0.5;
        g -= squeezeBase * gOver * gOver * 255 * 0.5;
        b -= squeezeBase * bOver * bOver * 255 * 0.5;
      }
      if (options.localContrast > 0) {
        const detail = localDetail(source, width, height, x, y);
        r += detail[0] * localBoost;
        g += detail[1] * localBoost;
        b += detail[2] * localBoost;
      }
      if (options.vignette > 0) {
        const nx = x / width - 0.5;
        const ny = y / height - 0.5;
        const distance = Math.hypot(nx, ny) / Math.SQRT1_2;
        const falloff = Math.min(1, distance) * options.vignette;
        r *= 1 - falloff;
        g *= 1 - falloff;
        b *= 1 - falloff;
      }
      channelThresholds(orderedSteps, x, y, options, step);

      let rq = Math.round((r + orderedSteps[0]) / step) * step;
      let gq = Math.round((g + orderedSteps[1]) / step) * step;
      let bq = Math.round((b + orderedSteps[2]) / step) * step;

      if (options.ditherAmount < 1) {
        const amount = Math.max(0, options.ditherAmount);

        rq = lerp(Math.round(r / step) * step, rq, amount);
        gq = lerp(Math.round(g / step) * step, gq, amount);
        bq = lerp(Math.round(b / step) * step, bq, amount);
      }
      r = rq;
      g = gq;
      b = bq;
      const brightness = luminance(r, g, b) / 255;
      const midBell = Math.sin(Math.PI * brightness);
      const inkVariation =
        hashNoise(x * DITHER_INK_FREQUENCY, y * DITHER_INK_FREQUENCY) * options.ink * midBell;
      r += inkVariation;
      g += inkVariation;
      b += inkVariation;
      if (options.inkDensity > 0 && usePalette) {
        const darkness = 1 - luminance(r, g, b) / 255;
        const density = inkDensity * darkness * darkness;
        r = lerp(r, inkTarget[0], density);
        g = lerp(g, inkTarget[1], density);
        b = lerp(b, inkTarget[2], density);
      }
      if (options.paletteBias > 0 && usePalette) {
        const target = nearestPaletteColor(r, g, b, options.palette);
        r = lerp(r, target[0], options.paletteBias);
        g = lerp(g, target[1], options.paletteBias);
        b = lerp(b, target[2], options.paletteBias);
      }
      if (options.paper > 0) {
        const paperNoise =
          smoothNoise(
            x / DITHER_PAPER_LATTICE + DITHER_PAPER_OFFSET,
            y / DITHER_PAPER_LATTICE + DITHER_PAPER_OFFSET
          ) * options.paper;
        const paperBrightness = luminance(r, g, b) / 255;
        const paperAmount = paperBrightness * paperNoise;
        r += paperAmount;
        g += paperAmount;
        b += paperAmount;
      }
      output[i] = clampChannel(r);
      output[i + 1] = clampChannel(g);
      output[i + 2] = clampChannel(b);
      output[i + 3] = sampleChannel(source, width, height, x + distortionX, y + distortionY, 3);
    }
    reportBandProgress(onBand, y, height);
  }
  return finishDitherImage(output, width, height, options);
}

export const ditherRenderCache = createLruCache<string, DitherCacheEntry>(
  DITHER_RENDER_CACHE_CAPACITY
);

export const ditherDecodeCache = createLruCache<string, ImageBitmap>(DITHER_DECODE_CACHE_CAPACITY);

export function ditherCacheKey(src: string, scale: number, options: DitherEffectOptions): string {
  return `${src}\n${scale}\n${JSON.stringify(options)}`;
}
export function ditherBuffersEqual(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

let sharedWorker: Worker | null = null;

export function getDitherWorker(): Worker | null {
  if (!sharedWorker) {
    const [worker, error] = attemptSync(
      () =>
        new Worker(new URL("../workers/dither.worker", import.meta.url), {
          type: "module",
        })
    );
    if (error) return null;
    sharedWorker = worker;
  }
  return sharedWorker;
}

export function subscribeWorkerJob(
  worker: Worker,
  onResult: (event: MessageEvent<DitherWorkerResponse>) => void,
  onError: () => void,
  onProgress?: (event: MessageEvent<DitherWorkerProgress>) => void
): () => void {
  const onMessage = (event: MessageEvent<DitherWorkerResponse | DitherWorkerProgress>) => {
    if (event.data.type === "progress") {
      onProgress?.(event as MessageEvent<DitherWorkerProgress>);
      return;
    }
    onResult(event as MessageEvent<DitherWorkerResponse>);
  };
  worker.addEventListener("message", onMessage);
  worker.addEventListener("error", onError, { once: true });
  return () => {
    worker.removeEventListener("message", onMessage);
    worker.removeEventListener("error", onError);
  };
}

// Test seam: drops the shared instance so suites can stub Worker per test.
export function resetDitherWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
}

export function withDitherDefaults(overrides: Partial<DitherEffectOptions>): DitherEffectOptions {
  const merged: DitherEffectOptions = { ...DITHER_DEFAULTS };

  for (const key of Object.keys(overrides) as (keyof DitherEffectOptions)[]) {
    const value = overrides[key];
    if (value !== undefined) merged[key] = value as never;
  }
  return merged;
}
