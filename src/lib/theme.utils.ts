import { hexToRgb, rgbToHex } from "./color.utils";

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)!;
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function mix(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1)!;
  const [r2, g2, b2] = hexToRgb(c2)!;
  return rgbToHex(r1 * t + r2 * (1 - t), g1 * t + g2 * (1 - t), b1 * t + b2 * (1 - t));
}

function tint(hex: string, amount: number): string {
  return mix(hex, "#ffffff", amount);
}

function shade(hex: string, amount: number): string {
  return mix(hex, "#000000", amount);
}

export interface GeneratedThemeColors {
  background: string;
  primary: string;
  secondary: string;
  text: string;
  muted: string;
  highlight: string;
  destructive: string;
  success: string;
  linkHover: string;
  surface: string;
  winHighlight: string;
  winShadow: string;
}

export function generateFromAccent(accent: string, bg: string): GeneratedThemeColors {
  const isLight = luminance(bg) > 128;
  const lum = luminance(accent);
  const isAccentLight = lum > 180;

  if (isLight) {
    const primary = shade(bg, 0.12);
    const surface = shade(bg, 0.18);
    return {
      background: bg,
      primary,
      secondary: accent,
      text: "#000000",
      muted: shade(bg, 0.4),
      highlight: accent,
      destructive: mix(accent, "#cc3333", 0.6),
      success: mix(accent, "#339933", 0.6),
      linkHover: shade(accent, 0.2),
      surface,
      winHighlight: tint(bg, 0.1),
      winShadow: shade(bg, 0.35),
    };
  }

  const primary = isAccentLight ? tint(accent, 0.82) : tint(shade(accent, 0.3), 0.78);
  const surface = tint(primary, 0.1);
  return {
    background: bg,
    primary,
    secondary: accent,
    text: "#000000",
    muted: shade(primary, 0.35),
    highlight: accent,
    destructive: mix(accent, "#cc3333", 0.5),
    success: mix(accent, "#33aa55", 0.5),
    linkHover: tint(accent, 0.15),
    surface,
    winHighlight: tint(surface, 0.08),
    winShadow: shade(primary, 0.25),
  };
}
