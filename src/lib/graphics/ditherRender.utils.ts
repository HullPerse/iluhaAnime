import {
  BLUE_NOISE_64,
  BLUE_NOISE_RANGE,
  BLUE_NOISE_SIZE,
} from "@/config/graphics/blueNoise.config";
import {
  DITHER_BAND_ROWS,
  DITHER_BARREL_STRENGTH,
  DITHER_BAYER_4,
  DITHER_BAYER_8,
  DITHER_BAYER_RANGE,
  DITHER_BAYER_SIZE,
  DITHER_BAYER8_RANGE,
  DITHER_BAYER8_SIZE,
  DITHER_CHANNEL_SHIFT,
  DITHER_CHROMATIC_SHIFT,
  DITHER_GLYPH_ALPHA,
  DITHER_GLYPH_HEIGHT,
  DITHER_GLYPH_PAD,
  DITHER_GLYPH_RAMP,
  DITHER_GLYPH_WIDTH,
  DITHER_GRAIN_FREQUENCY,
  DITHER_LUMINANCE_BLUE,
  DITHER_LUMINANCE_GREEN,
  DITHER_LUMINANCE_RED,
  DITHER_NOISE_GAIN,
  DITHER_NOISE_X,
  DITHER_NOISE_Y,
  DITHER_SCANLINE_DEPTH,
  DITHER_VIGNETTE_DEPTH,
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

export function nearestPaletteColor(
  r: number,
  g: number,
  b: number,
  palette: readonly DitherRGB[]
): DitherRGB {
  let best = palette[0] ?? ([0, 0, 0] as DitherRGB);
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

function reportBandProgress(
  onBand: ((doneRows: number) => void) | undefined,
  doneRows: number,
  height: number
): void {
  if (onBand === undefined) return;
  if (doneRows % DITHER_BAND_ROWS === 0 || doneRows === height) onBand(doneRows);
}

function grayRampTargets(levels: number): DitherRGB[] {
  const steps = Math.max(2, Math.floor(levels));
  const step = 255 / (steps - 1);
  const ramp: DitherRGB[] = [];
  for (let i = 0; i < steps; i++) {
    const v = Math.round(i * step);
    ramp.push([v, v, v]);
  }
  return ramp;
}

function applyContrastInPlace(image: Uint8ClampedArray, contrast: number): void {
  const c = Math.max(-1, Math.min(1, contrast));
  for (let i = 0; i < image.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const t = image[i + channel] / 255;
      if (c >= 0) {
        const s = t * t * (3 - 2 * t);
        image[i + channel] = (t + (s - t) * c) * 255;
      } else {
        image[i + channel] = (0.5 + (t - 0.5) * (1 + c)) * 255;
      }
    }
  }
}

function applyGrainInPlace(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  grain: number
): void {
  const amplitude = Math.max(0, Math.min(1, grain)) * 60;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = hashNoise(x * DITHER_GRAIN_FREQUENCY, y * DITHER_GRAIN_FREQUENCY) * amplitude;
      const i = (y * width + x) * 4;
      image[i] += n;
      image[i + 1] += n;
      image[i + 2] += n;
    }
  }
}

function applyVignetteInPlace(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  vignette: number
): void {
  const amount = Math.max(0, Math.min(1, vignette));
  for (let y = 0; y < height; y++) {
    const ny = (y / Math.max(1, height - 1) - 0.5) * 2;
    for (let x = 0; x < width; x++) {
      const nx = (x / Math.max(1, width - 1) - 0.5) * 2;
      const d = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2);
      const falloff = amount * DITHER_VIGNETTE_DEPTH * (d * d);
      const i = (y * width + x) * 4;
      const k = 1 - falloff;
      image[i] *= k;
      image[i + 1] *= k;
      image[i + 2] *= k;
    }
  }
}

function applyGeometry(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  barrel: number,
  chromatic: number
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(source.length);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxRadius = Math.max(1, Math.hypot(cx, cy));
  const shift = Math.max(0, Math.min(1, chromatic)) * DITHER_CHROMATIC_SHIFT;
  const barrelAmount = Math.max(0, barrel) * DITHER_BARREL_STRENGTH;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let sx = x;
      let sy = y;
      if (barrelAmount !== 0) {
        const nx = (x - cx) / Math.max(1, cx);
        const ny = (y - cy) / Math.max(1, cy);
        const zoom = 1 + barrelAmount * (nx * nx + ny * ny);
        sx = cx + (x - cx) * zoom;
        sy = cy + (y - cy) * zoom;
      }
      if (shift !== 0) {
        const radius = Math.hypot(x - cx, y - cy) / maxRadius;
        const s = shift * radius;
        output[i] = sampleChannel(source, width, height, sx + s, sy, 0);
        output[i + 1] = sampleChannel(source, width, height, sx, sy, 1);
        output[i + 2] = sampleChannel(source, width, height, sx - s, sy, 2);
        output[i + 3] = sampleChannel(source, width, height, sx, sy, 3);
      } else {
        output[i] = sampleChannel(source, width, height, sx, sy, 0);
        output[i + 1] = sampleChannel(source, width, height, sx, sy, 1);
        output[i + 2] = sampleChannel(source, width, height, sx, sy, 2);
        output[i + 3] = sampleChannel(source, width, height, sx, sy, 3);
      }
    }
  }
  return output;
}

function applyScanlinesInPlace(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  scanlines: number
): void {
  const amount = Math.max(0, Math.min(1, scanlines));
  for (let y = 1; y < height; y += 2) {
    const k = 1 - amount * DITHER_SCANLINE_DEPTH;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      image[i] *= k;
      image[i + 1] *= k;
      image[i + 2] *= k;
    }
  }
}

function applyOrderedDither(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  options: DitherEffectOptions,
  onBand?: (doneRows: number) => void
): void {
  const step = 255 / Math.max(1, options.levels - 1);
  const invStep = 1 / step;
  const strength = options.strength;
  const monochrome = options.monochrome;
  const palette = options.palette;
  const usePalette = palette.length > 0 && options.paletteMix > 0;
  const paletteMix = Math.max(0, Math.min(1, options.paletteMix));
  const linearPalette = usePalette
    ? palette.map(([r, g, b]): [number, number, number] => [
        srgbChannelToLinear(r),
        srgbChannelToLinear(g),
        srgbChannelToLinear(b),
      ])
    : [];
  const shiftG = DITHER_CHANNEL_SHIFT[1] as readonly [number, number];
  const shiftB = DITHER_CHANNEL_SHIFT[2] as readonly [number, number];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = image[i];
      let g = image[i + 1];
      let b = image[i + 2];
      if (monochrome) {
        const l = luminance(r, g, b);
        r = l;
        g = l;
        b = l;
      }
      const t = matrixThreshold(x, y, options.matrix) * step * strength;
      const rd = r + t;
      const gd = monochrome
        ? g + t
        : g + matrixThreshold(x + shiftG[0], y + shiftG[1], options.matrix) * step * strength;
      const bd = monochrome
        ? b + t
        : b + matrixThreshold(x + shiftB[0], y + shiftB[1], options.matrix) * step * strength;
      const rq = Math.round(rd * invStep) * step;
      const gq = Math.round(gd * invStep) * step;
      const bq = Math.round(bd * invStep) * step;

      if (usePalette) {
        const pick = nearestPaletteIndexLinear(rd, gd, bd, linearPalette);
        const target = palette[pick] as DitherRGB;
        image[i] = lerp(rq, target[0], paletteMix);
        image[i + 1] = lerp(gq, target[1], paletteMix);
        image[i + 2] = lerp(bq, target[2], paletteMix);
      } else {
        image[i] = rq;
        image[i + 1] = gq;
        image[i + 2] = bq;
      }
    }
    reportBandProgress(onBand, y + 1, height);
  }
}

const FLOYD_STEINBERG_KERNEL: readonly (readonly [number, number, number])[] = [
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16],
];

const ATKINSON_KERNEL: readonly (readonly [number, number, number])[] = [
  [1, 0, 1 / 8],
  [2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [0, 1, 1 / 8],
  [1, 1, 1 / 8],
  [-1, 2, 1 / 8],
];

export function diffuseImageBuffer(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  options: DitherEffectOptions,
  onBand?: (doneRows: number) => void
): void {
  if (width <= 0 || height <= 0) return;
  const kernel = options.mode === "atkinson" ? ATKINSON_KERNEL : FLOYD_STEINBERG_KERNEL;
  const errorScale = Math.max(0, Math.min(2, options.strength));
  if (options.palette.length > 0 && options.paletteMix > 0) {
    diffuseToPalette(image, width, height, options.palette, kernel, errorScale, onBand);
    return;
  }
  diffuseLuminance(image, width, height, options.levels, kernel, errorScale, onBand);
}

type DiffuseKernel = readonly (readonly [number, number, number])[];

function diffuseToPalette(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  palette: DitherRGB[],
  kernel: DiffuseKernel,
  errorScale: number,
  onBand?: (doneRows: number) => void
): void {
  const work = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    work[i * 3] = image[o];
    work[i * 3 + 1] = image[o + 1];
    work[i * 3 + 2] = image[o + 2];
  }
  for (let y = 0; y < height; y++) {
    const mirrored = y % 2 === 1;
    const x0 = mirrored ? width - 1 : 0;
    const xStep = mirrored ? -1 : 1;
    for (let x = x0; mirrored ? x >= 0 : x < width; x += xStep) {
      const w = (y * width + x) * 3;
      const pick = nearestPaletteIndex(work[w], work[w + 1], work[w + 2], palette);
      const target = palette[pick] as DitherRGB;
      const errorR = (work[w] - target[0]) * errorScale;
      const errorG = (work[w + 1] - target[1]) * errorScale;
      const errorB = (work[w + 2] - target[2]) * errorScale;
      const o = (y * width + x) * 4;
      image[o] = target[0];
      image[o + 1] = target[1];
      image[o + 2] = target[2];
      for (const [dx, dy, weight] of kernel) {
        const nx = mirrored ? x - dx : x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const n = (ny * width + nx) * 3;
        work[n] += errorR * weight;
        work[n + 1] += errorG * weight;
        work[n + 2] += errorB * weight;
      }
    }
    reportBandProgress(onBand, y + 1, height);
  }
}

function diffuseLuminance(
  image: Uint8ClampedArray,
  width: number,
  height: number,
  levels: number,
  kernel: DiffuseKernel,
  errorScale: number,
  onBand?: (doneRows: number) => void
): void {
  const ramp = grayRampTargets(levels);
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    luma[i] = luminance(image[o], image[o + 1], image[o + 2]);
  }
  for (let y = 0; y < height; y++) {
    const mirrored = y % 2 === 1;
    const x0 = mirrored ? width - 1 : 0;
    const xStep = mirrored ? -1 : 1;
    for (let x = x0; mirrored ? x >= 0 : x < width; x += xStep) {
      const index = y * width + x;
      const value = luma[index];
      const pick = nearestRampIndex(value, ramp);
      const target = ramp[pick] as DitherRGB;
      const error = (value - target[0]) * errorScale;
      const o = index * 4;
      image[o] = target[0];
      image[o + 1] = target[1];
      image[o + 2] = target[2];
      for (const [dx, dy, weight] of kernel) {
        const nx = mirrored ? x - dx : x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        luma[ny * width + nx] += error * weight;
      }
    }
    reportBandProgress(onBand, y + 1, height);
  }
}

function nearestRampIndex(value: number, ramp: readonly DitherRGB[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < ramp.length; i++) {
    const entry = ramp[i] as DitherRGB;
    const distance = Math.abs(value - entry[0]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: readonly DitherRGB[]
): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const entry = palette[i] as DitherRGB;
    const dr = r - entry[0];
    const dg = g - entry[1];
    const db = b - entry[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
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
      const endX = Math.min(width, originX + cell);
      const endY = Math.min(height, originY + cell);
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let y = originY; y < endY; y++) {
        for (let x = originX; x < endX; x++) {
          const o = (y * width + x) * 4;
          sumR += image[o];
          sumG += image[o + 1];
          sumB += image[o + 2];
          count += 1;
        }
      }
      if (count === 0) continue;
      const dot: [number, number, number] = [sumR / count, sumG / count, sumB / count];
      const radius = (1 - luminance(dot[0], dot[1], dot[2]) / 255) * cover;
      const centerX = originX + (endX - originX) / 2;
      const centerY = originY + (endY - originY) / 2;
      for (let y = Math.round(originY); y < endY; y++) {
        for (let x = Math.round(originX); x < endX; x++) {
          const o = (y * width + x) * 4;
          const dx = x + 0.5 - centerX;
          const dy = y + 0.5 - centerY;
          const coverage = halftoneCoverage(dx * dx + dy * dy, radius, soft);
          output[o] = lerp(paper[0], dot[0], coverage);
          output[o + 1] = lerp(paper[1], dot[1], coverage);
          output[o + 2] = lerp(paper[2], dot[2], coverage);
        }
      }
    }
  }
  return output;
}

const GLYPH_MASKS: Record<string, readonly string[]> = {
  ".": ["00000", "00000", "00000", "00000", "00000", "00100", "00000"],
  ":": ["00000", "00100", "00000", "00000", "00100", "00000", "00000"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
  "~": ["00000", "00000", "00000", "00110", "11001", "00000", "00000"],
  "×": ["10001", "01010", "00100", "01010", "10001", "00000", "00000"],
  "*": ["00100", "10101", "01110", "10101", "00100", "00000", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
};

export function applyGlyphOverlay(
  image: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  options: DitherEffectOptions
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(image);
  const strength = Math.max(0, Math.min(1, options.glyphs));
  if (strength === 0 || width <= 0 || height <= 0) return output;
  const cell = Math.max(2, Math.floor(options.glyphSize));
  const pad = Math.min(DITHER_GLYPH_PAD, cell >> 1);
  const inner = Math.max(1, cell - pad * 2);
  const ink =
    options.palette.length > 0
      ? lightestPaletteColor(options.palette)
      : ([255, 255, 255] as DitherRGB);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  for (let cy = 0; cy < rows; cy++) {
    const startY = cy * cell;
    const endY = Math.min(height, startY + cell);
    for (let cx = 0; cx < cols; cx++) {
      const startX = cx * cell;
      const endX = Math.min(width, startX + cell);
      let sum = 0;
      let count = 0;
      for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
          const i = (py * width + px) * 4;
          sum += luminance(image[i], image[i + 1], image[i + 2]);
          count += 1;
        }
      }
      if (count === 0) continue;
      const density = sum / count / 255;
      const index = Math.max(
        0,
        Math.min(DITHER_GLYPH_RAMP.length - 1, Math.trunc(density * DITHER_GLYPH_RAMP.length))
      );
      const mask = GLYPH_MASKS[DITHER_GLYPH_RAMP[index] ?? ""];
      if (mask === undefined) continue;
      const drawnRows = Math.min(inner, endY - startY - pad);
      const drawnCols = Math.min(inner, endX - startX - pad);
      if (drawnRows <= 0 || drawnCols <= 0) continue;
      const alpha = Math.min(1, strength * (0.35 + 0.65 * density) * DITHER_GLYPH_ALPHA);
      for (let gy = 0; gy < drawnRows; gy++) {
        const rowIndex = Math.min(
          DITHER_GLYPH_HEIGHT - 1,
          Math.trunc((gy * DITHER_GLYPH_HEIGHT) / drawnRows)
        );
        const row = mask[rowIndex];
        if (row === undefined) continue;
        const oy = startY + pad + gy;
        for (let gx = 0; gx < drawnCols; gx++) {
          const maskX = Math.min(
            DITHER_GLYPH_WIDTH - 1,
            Math.trunc((gx * DITHER_GLYPH_WIDTH) / drawnCols)
          );
          if (row[maskX] !== "1") continue;
          const o = (oy * width + startX + pad + gx) * 4;
          output[o] = lerp(output[o], ink[0], alpha);
          output[o + 1] = lerp(output[o + 1], ink[1], alpha);
          output[o + 2] = lerp(output[o + 2], ink[2], alpha);
        }
      }
    }
  }
  return output;
}

function applyHalftonePass(
  image: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  options: DitherEffectOptions
): Uint8ClampedArray<ArrayBuffer> {
  const amount = Math.max(0, Math.min(1, options.halftone));
  if (amount <= 0 || options.dotSize <= 0) return image;
  const paper =
    options.palette.length > 0
      ? lightestPaletteColor(options.palette)
      : ([255, 255, 255] as DitherRGB);
  const dotted = applyHalftoneDots(
    image,
    width,
    height,
    options.dotSize,
    options.dotSoftness,
    paper
  );
  if (amount >= 1) return dotted;
  for (let i = 0; i < image.length; i++) dotted[i] = lerp(image[i], dotted[i], amount);
  return dotted;
}

export function renderDitherImage(
  source: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  options: DitherEffectOptions,
  onBand?: (doneRows: number) => void
): Uint8ClampedArray<ArrayBuffer> {
  let work: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(source);
  if (options.barrel !== 0 || options.chromatic !== 0) {
    work = applyGeometry(work, width, height, options.barrel, options.chromatic);
  }
  if (options.contrast !== 0) applyContrastInPlace(work, options.contrast);
  if (options.grain > 0) applyGrainInPlace(work, width, height, options.grain);
  if (options.vignette > 0) applyVignetteInPlace(work, width, height, options.vignette);
  if (options.mode === "ordered") {
    applyOrderedDither(work, width, height, options, onBand);
  } else {
    diffuseImageBuffer(work, width, height, options, onBand);
  }
  work = applyHalftonePass(work, width, height, options);
  if (options.glyphs > 0) work = applyGlyphOverlay(work, width, height, options);
  if (options.scanlines > 0) applyScanlinesInPlace(work, width, height, options.scanlines);
  return work;
}
