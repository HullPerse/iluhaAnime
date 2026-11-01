import {
  BLUE_NOISE_64,
  BLUE_NOISE_RANGE,
  BLUE_NOISE_SIZE,
} from "@/config/graphics/blueNoise.config";
import {
  DITHER_BAYER_4,
  DITHER_BAYER_8,
  DITHER_BAYER_RANGE,
  DITHER_BAYER_SIZE,
  DITHER_BAYER8_RANGE,
  DITHER_BAYER8_SIZE,
  DITHER_LUMINANCE_BLUE,
  DITHER_LUMINANCE_GREEN,
  DITHER_LUMINANCE_RED,
  DITHER_NOISE_GAIN,
  DITHER_NOISE_X,
  DITHER_NOISE_Y,
} from "@/config/graphics/dither.config";
import type { DitherEffectOptions, DitherRGB } from "@/types/graphics/dither";

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

export function srgbChannelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  return (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
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

export function nearestPaletteColor(
  r: number,
  g: number,
  b: number,
  palette: readonly DitherRGB[]
): DitherRGB {
  let best = palette[0] ?? ([0, 0, 0] satisfies DitherRGB);
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

export function nearestPaletteIndexLinear(
  r: number,
  g: number,
  b: number,
  linearPalette: readonly (readonly [number, number, number])[]
): number {
  const lr = srgbChannelToLinear(r);
  const lg = srgbChannelToLinear(g);
  const lb = srgbChannelToLinear(b);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < linearPalette.length; i++) {
    const entry = linearPalette[i] as [number, number, number];
    const dr = lr - entry[0];
    const dg = lg - entry[1];
    const db = lb - entry[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
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

export function matrixThreshold(
  x: number,
  y: number,
  matrix: DitherEffectOptions["matrix"]
): number {
  if (matrix === "blue64") {
    return (
      (BLUE_NOISE_64[((y & (BLUE_NOISE_SIZE - 1)) << 6) + (x & (BLUE_NOISE_SIZE - 1))] + 0.5) /
        BLUE_NOISE_RANGE -
      0.5
    );
  }
  if (matrix === "bayer8") {
    return (
      (DITHER_BAYER_8[((y & (DITHER_BAYER8_SIZE - 1)) << 3) + (x & (DITHER_BAYER8_SIZE - 1))] +
        0.5) /
        DITHER_BAYER8_RANGE -
      0.5
    );
  }
  return (
    (DITHER_BAYER_4[((y & (DITHER_BAYER_SIZE - 1)) << 2) + (x & (DITHER_BAYER_SIZE - 1))] + 0.5) /
      DITHER_BAYER_RANGE -
    0.5
  );
}
