import {
  DITHER_DECODE_CACHE_CAPACITY,
  DITHER_DEFAULTS,
  DITHER_RENDER_CACHE_CAPACITY,
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
    if (value !== undefined) {
      Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

export function parseDitherOptions(raw: string | null | undefined): DitherEffectOptions {
  if (raw) {
    const [parsed, error] = attemptSync(() => JSON.parse(raw) as Partial<DitherEffectOptions>);
    if (!error && parsed && typeof parsed === "object") {
      return withDitherDefaults(parsed);
    }
  }
  return withDitherDefaults({});
}

export const EXTRACT_PALETTE_MIN_COLORS = 2;

export const EXTRACT_PALETTE_MAX_COLORS = 8;

function averageBoxColor(colors: DitherRGB[]): DitherRGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of colors) {
    r += color[0];
    g += color[1];
    b += color[2];
  }
  const n = Math.max(1, colors.length);
  return [Math.floor(r / n), Math.floor(g / n), Math.floor(b / n)];
}

function widestChannel(colors: DitherRGB[]): 0 | 1 | 2 {
  const min: [number, number, number] = [255, 255, 255];
  const max: [number, number, number] = [0, 0, 0];
  for (const color of colors) {
    for (const channel of [0, 1, 2] as const) {
      if (color[channel] < min[channel]) min[channel] = color[channel];
      if (color[channel] > max[channel]) max[channel] = color[channel];
    }
  }
  const ranges = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (ranges[1] > ranges[0] && ranges[1] >= ranges[2]) return 1;
  if (ranges[2] > ranges[0] && ranges[2] > ranges[1]) return 2;
  return 0;
}

export function extractPaletteFromPixels(data: Uint8ClampedArray, count: number): DitherRGB[] {
  const wanted = Math.max(
    EXTRACT_PALETTE_MIN_COLORS,
    Math.min(EXTRACT_PALETTE_MAX_COLORS, Math.floor(count))
  );
  const pixels: DitherRGB[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];
  const boxes: DitherRGB[][] = [pixels];
  while (boxes.length < wanted) {
    let splitIndex = -1;
    let splitRange = -1;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (!box || box.length < 2) continue;
      const channel = widestChannel(box);
      const sorted = [...box].sort((a, c) => a[channel] - c[channel]);
      const last = sorted.at(-1);
      if (last === undefined) continue;
      const range = last[channel] - sorted[0][channel];
      if (range > splitRange) {
        splitRange = range;
        splitIndex = b;
      }
    }
    if (splitIndex < 0 || splitRange <= 0) break;
    const box = boxes[splitIndex];
    const channel = widestChannel(box);
    const sorted = [...box].sort((a, c) => a[channel] - c[channel]);
    const mid = Math.floor(sorted.length / 2);
    boxes[splitIndex] = sorted.slice(0, mid);
    boxes.push(sorted.slice(mid));
  }
  return boxes
    .map((box) => ({ color: averageBoxColor(box), size: box.length }))
    .sort((a, b) => b.size - a.size)
    .map((entry) => entry.color);
}
