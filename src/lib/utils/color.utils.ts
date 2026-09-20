import type { ChannelFormat, ColorFormat, HSL, HSV, RGBA, RGB } from "@/types/color";

export function rgbaToHex({ r, g, b, a }: RGBA, includeAlpha = false) {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (!includeAlpha) return hex;
  return `${hex}${toHex(Math.round(a * 255))}`;
}

export function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  return rgbaToHex({ a: 1, b, g, r }, false);
}

export function hexToRgba(hex: string): RGBA | null {
  const clean = hex.replace(/^#/, "").trim();
  if (!(clean.length === 6 || clean.length === 8)) return null;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const a = clean.length === 8 ? Number.parseInt(clean.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { a, b, g, r };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** The six hue segments as channel order into `[chroma, second, 0]`. */
const HUE_SEGMENTS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [1, 0, 2],
  [2, 0, 1],
  [2, 1, 0],
  [1, 2, 0],
  [0, 2, 1],
];

function hueFromRgb(r: number, g: number, b: number, max: number, delta: number): number {
  if (delta === 0) return 0;
  if (max === r) return normalizeHue(60 * (((g - b) / delta) % 6));
  if (max === g) return normalizeHue(60 * ((b - r) / delta + 2));
  return normalizeHue(60 * ((r - g) / delta + 4));
}

function chromaToRgb(c: number, second: number, m: number, hue: number): RGB {
  const segment = HUE_SEGMENTS[Math.min(5, Math.floor(normalizeHue(hue) / 60))] ?? HUE_SEGMENTS[0]!;
  const values = [c, second, 0];
  const [r, g, b] = segment.map((index) => values[index] ?? 0) as [number, number, number];
  return {
    b: Math.round((b + m) * 255),
    g: Math.round((g + m) * 255),
    r: Math.round((r + m) * 255),
  };
}

/**
 * Hue and saturation stay unrounded on purpose: the picker keeps its state in HSV, and a hex put
 * through HSV and back has to return the same colour.
 */
export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  return {
    h: hueFromRgb(rn, gn, bn, max, delta),
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const c = value * saturation;
  const second = c * (1 - Math.abs(((normalizeHue(h) / 60) % 2) - 1));
  return chromaToRgb(c, second, value - c, h);
}

/** Rounded to whole degrees and percents: this feeds number fields, not the colour maths. */
export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  return {
    h: Math.round(hueFromRgb(rn, gn, bn, max, delta)),
    l: Math.round(lightness * 100),
    s: delta === 0 ? 0 : Math.round((delta / (1 - Math.abs(2 * lightness - 1))) * 100),
  };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = c * (1 - Math.abs(((normalizeHue(h) / 60) % 2) - 1));
  return chromaToRgb(c, second, lightness - c / 2, h);
}

export function hslToHsv({ h, s, l }: HSL): HSV {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const value = lightness + saturation * Math.min(lightness, 1 - lightness);
  return {
    h: normalizeHue(h),
    s: value === 0 ? 0 : ((2 * (value - lightness)) / value) * 100,
    v: value * 100,
  };
}

/**
 * Accepts what someone would actually type: six digits or the three-digit shorthand, with or
 * without the hash. The four- and eight-digit forms carry alpha the picker cannot edit, so they
 * are rejected instead of being silently stripped.
 */
export function hexToRgb(hex: string): RGB | null {
  const clean = hex.trim().replace(/^#/u, "").trim();
  if (!(clean.length === 3 || clean.length === 6)) return null;
  const expanded =
    clean.length === 3 ? [...clean].map((character) => character + character).join("") : clean;
  const rgba = hexToRgba(`#${expanded}`);
  if (!rgba) return null;
  return { b: rgba.b, g: rgba.g, r: rgba.r };
}

export function hexToHsv(hex: string): HSV | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

export function rgbToHexString(rgb: RGB): string {
  return rgbaToHex({ a: 1, b: rgb.b, g: rgb.g, r: rgb.r }, false);
}

export function hsvToHex(hsv: HSV): string {
  return rgbToHexString(hsvToRgb(hsv));
}

/** The three channel fields shown for `format`, as strings ready for an input. */
export function hsvToChannelStrings(hsv: HSV, format: ChannelFormat): [string, string, string] {
  const rgb = hsvToRgb(hsv);
  if (format === "rgb") return [String(rgb.r), String(rgb.g), String(rgb.b)];
  const { h, s, l } = rgbToHsl(rgb);
  return [String(h), String(s), String(l)];
}

const FORMATTERS: Record<ColorFormat, (rgb: RGB) => string> = {
  hex: (rgb) => rgbToHexString(rgb),
  hsl: (rgb) => {
    const { h, s, l } = rgbToHsl(rgb);
    return `${h}, ${s}%, ${l}%`;
  },
  rgb: (rgb) => `${rgb.r}, ${rgb.g}, ${rgb.b}`,
};

export function formatColor(hsv: HSV, format: ColorFormat): string {
  return FORMATTERS[format](hsvToRgb(hsv));
}

function parseChannels(input: string): number[] {
  return input
    .replaceAll(/[^0-9.,\s-]/gu, " ")
    .split(/[\s,]+/u)
    .filter((part) => part !== "")
    .map(Number);
}

/** Reads back what `formatColor` writes, so a value can be typed or pasted in any format. */
export function parseColor(input: string, format: ColorFormat): HSV | null {
  if (format === "hex") return hexToHsv(input);
  const numbers = parseChannels(input);
  if (numbers.length < 3 || numbers.some(Number.isNaN)) return null;
  const [first = 0, second = 0, third = 0] = numbers;
  if (format === "rgb") {
    return rgbToHsv({ b: clamp(third, 0, 255), g: clamp(second, 0, 255), r: clamp(first, 0, 255) });
  }
  return hslToHsv({ h: clamp(first, 0, 360), l: clamp(third, 0, 100), s: clamp(second, 0, 100) });
}
