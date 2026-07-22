import type { RGBA } from "@/types/color";

export function rgbaToHex({ r, g, b, a }: RGBA, includeAlpha = false) {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (!includeAlpha) return hex;
  return `${hex}${toHex(Math.round(a * 255))}`;
}

export function hexToRgba(hex: string): RGBA | null {
  const clean = hex.replace(/^#/, "").trim();
  if (!(clean.length === 6 || clean.length === 8)) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}
