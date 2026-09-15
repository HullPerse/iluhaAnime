import { attemptSync } from "@/lib/utils/attempt.utils";
import type { ThemeDefinition } from "@/types/theme";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const PALETTE_LIMIT = 8;
export const PALETTE_SAMPLE_SIZE = 64;

const BUCKET_SHIFT = 4;
const MIN_ALPHA = 24;
const MIN_DISTANCE = 28;

export function hexToRgb(hex: string): RGB | null {
  const match = hex.trim().match(/^#([\da-f]{6})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { b: value & 0xff, g: (value >> 8) & 0xff, r: (value >> 16) & 0xff };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function relativeLuminance({ r, g, b }: RGB): number {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  if (first === null || second === null) return 1;
  const one = relativeLuminance(first);
  const two = relativeLuminance(second);
  const lighter = Math.max(one, two);
  const darker = Math.min(one, two);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal text. */
const AA_CONTRAST = 4.5;

/** The extremes a wallpaper can be: a translucent face has to survive both. */
const DESKTOP_EXTREMES = ["#000000", "#ffffff"];

/** Below this nothing of the desktop shows through, so the window effect is pointless. */
export const WINDOW_TINT_MIN = 0.72;

/** Above this the face is opaque and the effect is invisible. */
export const WINDOW_TINT_MAX = 0.95;

/**
 * Alpha for the window face when a window effect paints the desktop behind it.
 *
 * A translucent window has no fixed backdrop, so the only honest target is the worst case: pick
 * the lowest alpha that keeps body text at AA against *both* a black and a white wallpaper, then
 * clamp it into the band where the glass is neither invisible nor unreadable. That is why the
 * dark themes end up near `WINDOW_TINT_MAX` and the light ones near `WINDOW_TINT_MIN`.
 */
export function windowTintAlpha(face: string, text: string): number {
  const base = hexToRgb(face);
  if (base === null) return WINDOW_TINT_MAX;
  let required = 0;
  for (const desktop of DESKTOP_EXTREMES) {
    const under = hexToRgb(desktop);
    if (under === null) continue;
    // Starts at 1 so a backdrop this face can never satisfy counts as "needs everything".
    let satisfied = 1;
    for (let alpha = 0; alpha <= 1.0001; alpha += 0.01) {
      const blended = rgbToHex({
        b: under.b + (base.b - under.b) * alpha,
        g: under.g + (base.g - under.g) * alpha,
        r: under.r + (base.r - under.r) * alpha,
      });
      if (contrastRatio(blended, text) >= AA_CONTRAST) {
        satisfied = alpha;
        break;
      }
    }
    required = Math.max(required, satisfied);
  }
  return Math.min(WINDOW_TINT_MAX, Math.max(WINDOW_TINT_MIN, Number(required.toFixed(2))));
}

export function saturation({ r, g, b }: RGB): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function mixHex(a: string, b: string, amount: number): string {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  if (first === null) return b;
  if (second === null) return a;
  const weight = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    b: first.b + (second.b - first.b) * weight,
    g: first.g + (second.g - first.g) * weight,
    r: first.r + (second.r - first.r) * weight,
  });
}

export function shade(hex: string, amount: number): string {
  return mixHex(hex, amount >= 0 ? "#ffffff" : "#000000", Math.abs(amount));
}

function distance(a: RGB, b: RGB): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * Plain RGB distance between two hex colours, used to decide whether two tokens are
 * far enough apart to be told apart. Returns 0 for input it cannot parse.
 */
export function colorDistance(a: string, b: string): number {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  if (first === null || second === null) return 0;
  return distance(first, second);
}

export function quantizePalette(
  pixels: Uint8ClampedArray | Uint8Array,
  limit = PALETTE_LIMIT
): string[] {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < MIN_ALPHA) continue;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const key = ((r >> BUCKET_SHIFT) << 8) | ((g >> BUCKET_SHIFT) << 4) | (b >> BUCKET_SHIFT);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, { b, count: 1, g, r });
    else {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    }
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      color: { b: bucket.b / bucket.count, g: bucket.g / bucket.count, r: bucket.r / bucket.count },
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  const picked: RGB[] = [];
  for (const entry of ranked) {
    if (picked.length >= limit) break;
    if (picked.some((color) => distance(color, entry.color) < MIN_DISTANCE)) continue;
    picked.push(entry.color);
  }
  return picked.map(rgbToHex);
}

export function readImagePalette(image: HTMLImageElement, size = PALETTE_SAMPLE_SIZE): string[] {
  if (typeof document === "undefined") return [];
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null || typeof context.getImageData !== "function") return [];
  context.drawImage(image, 0, 0, size, size);
  const [palette, error] = attemptSync(() =>
    quantizePalette(context.getImageData(0, 0, size, size).data)
  );
  return error === null ? palette : [];
}

function mostSaturated(palette: RGB[], used: Set<string>): RGB | null {
  return (
    [...palette]
      .filter((color) => !used.has(rgbToHex(color)))
      .sort((a, b) => saturation(b) - saturation(a))[0] ?? null
  );
}

function mostBiased(palette: RGB[], bias: (color: RGB) => number): RGB | null {
  const best = [...palette].sort((a, b) => bias(b) - bias(a))[0];
  return best !== undefined && bias(best) > 0 ? best : null;
}

export function buildThemeColors(palette: string[]): ThemeDefinition["colors"] {
  const rgb = palette
    .map((color) => hexToRgb(color))
    .filter((color): color is RGB => color !== null);
  const fallback = {
    autocomplete: "#808080",
    autocompleteOpacity: 0.6,
    background: "#222222",
    destructive: "#800000",
    field: "#ffffff",
    highlight: "#0000ff",
    linkHover: "#ff0000",
    muted: "#808080",
    primary: "#c0c0c0",
    secondary: "#000080",
    success: "#008000",
    surface: "#d0d0d0",
    text: "#000000",
    winHighlight: "#ffffff",
    winShadow: "#808080",
  } satisfies ThemeDefinition["colors"];
  if (rgb.length === 0) return fallback;

  const byLuminance = [...rgb].sort((a, b) => relativeLuminance(a) - relativeLuminance(b));
  const darkest = byLuminance[0];
  const lightest = byLuminance.at(-1) ?? darkest;
  const light = relativeLuminance(rgb[0]) >= 0.5;
  const dark = !light;
  const background = rgbToHex(light ? lightest : darkest);
  const text = rgbToHex(light ? darkest : lightest);

  const used = new Set([background, text]);
  const secondary = mostSaturated(rgb, used) ?? (dark ? lightest : darkest);
  used.add(rgbToHex(secondary));
  const primary = rgbToHex(byLuminance[Math.floor((byLuminance.length - 1) / 2)]);
  const highlight = rgbToHex(mostSaturated(rgb, used) ?? secondary);
  const muted = mixHex(background, text, 0.45);
  const surface = dark ? shade(primary, 0.18) : shade(primary, -0.12);
  const red = mostBiased(rgb, (color) => color.r - (color.g + color.b) / 2);
  const green = mostBiased(rgb, (color) => color.g - (color.r + color.b) / 2);

  return {
    autocomplete: muted,
    autocompleteOpacity: 0.6,
    background,
    destructive: red === null ? fallback.destructive : rgbToHex(red),
    field: light ? fallback.field : shade(primary, -0.3),
    highlight,
    linkHover: highlight,
    muted,
    primary,
    secondary: rgbToHex(secondary),
    success: green === null ? fallback.success : rgbToHex(green),
    surface,
    text,
    winHighlight: shade(primary, 0.22),
    winShadow: shade(primary, -0.28),
  };
}
