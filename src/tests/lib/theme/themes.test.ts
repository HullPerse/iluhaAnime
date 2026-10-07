import { describe, expect, it } from "vitest";

import { DEFAULT_THEME_COLORS, THEMES, THEME_ACCENT_EXEMPT } from "@/config/settings/themes.config";
import {
  buildThemeColors,
  colorDistance,
  contrastRatio,
  deriveFieldColor,
  hexToRgb,
  rgbToHex,
  windowTintAlpha,
  WINDOW_TINT_MAX,
  WINDOW_TINT_MIN,
} from "@/lib/theme/palette.utils";
import { getTitleText, parseRetroismTheme } from "@/store/theme.store";

const MIN_COLOR_DISTANCE = 32;

const MIN_CONTRAST = 4.5;

const ACCENT_KEYS = ["highlight", "linkHover", "success", "destructive"] as const;

const STATUS_KEYS = ["downloading", "seeding", "done", "error", "idle", "missing"] as const;

function statusColors(theme: (typeof THEMES)[number]): Record<string, string> {
  const c = theme.colors;
  const overrides = theme.overrides ?? {};
  return {
    done: overrides.torrentDone ?? c.success,
    downloading: overrides.torrentDownloading ?? c.highlight,
    error: overrides.torrentError ?? c.destructive,
    idle: overrides.torrentIdle ?? c.muted,
    seeding: overrides.torrentSeeding ?? "#f97316",
    missing: overrides.torrentMissing ?? "#b8860b",
  };
}

function blendOver(face: string, desktop: string, alpha: number): string {
  const base = hexToRgb(face)!;
  const under = hexToRgb(desktop)!;
  return rgbToHex({
    b: under.b + (base.b - under.b) * alpha,
    g: under.g + (base.g - under.g) * alpha,
    r: under.r + (base.r - under.r) * alpha,
  });
}

function pairs<K extends string>(keys: readonly K[]): Array<[K, K]> {
  return keys.flatMap((a, index) => keys.slice(index + 1).map((b) => [a, b] as [K, K]));
}

describe("built-in themes", () => {
  it("keeps body text readable on the window face and in fields", () => {
    for (const theme of THEMES) {
      expect(
        contrastRatio(theme.colors.text, theme.colors.primary),
        theme.name
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(
        contrastRatio(theme.colors.text, theme.colors.field),
        theme.name
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it("keeps the titlebar label readable on every accent", () => {
    for (const theme of THEMES) {
      const label = getTitleText(theme.colors.secondary);
      expect(contrastRatio(label, theme.colors.secondary), theme.name).toBeGreaterThanOrEqual(
        MIN_CONTRAST
      );
    }
  });

  it("keeps the link-hover text readable on every surface it can sit on", () => {
    for (const theme of THEMES) {
      for (const surface of ["primary", "surface", "field"] as const) {
        expect(
          contrastRatio(theme.colors.linkHover, theme.colors[surface]),
          `${theme.name} on ${surface}`
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  it("separates the accent roles that also drive graph and status colours", () => {
    for (const theme of THEMES) {
      if (THEME_ACCENT_EXEMPT.includes(theme.name)) continue;
      for (const [a, b] of pairs(ACCENT_KEYS)) {
        expect(
          colorDistance(theme.colors[a], theme.colors[b]),
          `${theme.name}: ${a} vs ${b}`
        ).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
      }
    }
  });

  it("stays readable when a window effect makes the face translucent", () => {
    for (const theme of THEMES) {
      const alpha = windowTintAlpha(theme.colors.primary, theme.colors.text);
      expect(alpha, theme.name).toBeGreaterThanOrEqual(WINDOW_TINT_MIN);
      expect(alpha, theme.name).toBeLessThanOrEqual(WINDOW_TINT_MAX);
      for (const desktop of ["#000000", "#ffffff"]) {
        expect(
          contrastRatio(blendOver(theme.colors.primary, desktop, alpha), theme.colors.text),
          `${theme.name} over ${desktop}`
        ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  it("separates the torrent status colours", () => {
    for (const theme of THEMES) {
      const colors = statusColors(theme);
      for (const [a, b] of pairs(STATUS_KEYS)) {
        expect(
          colorDistance(colors[a], colors[b]),
          `${theme.name}: ${a} vs ${b}`
        ).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
      }
    }
  });

  it("only exempts themes whose palette cannot supply four accents", () => {
    for (const name of THEME_ACCENT_EXEMPT) {
      const theme = THEMES.find((item) => item.name === name);
      expect(theme, name).toBeDefined();
      const shades = new Set([
        theme!.colors.highlight,
        theme!.colors.linkHover,
        theme!.colors.success,
        theme!.colors.destructive,
        theme!.colors.primary,
        theme!.colors.surface,
      ]);
      expect(shades.size, `${name} should be a limited palette`).toBeLessThanOrEqual(5);
    }
  });
});

describe("theme token contract", () => {
  it("matches the win95 builtin palette", () => {
    const win95 = THEMES.find((item) => item.name === "win95")?.colors;
    expect(win95).toBeDefined();
    expect(DEFAULT_THEME_COLORS).toMatchObject({ ...win95 });
  });

  it("seeds empty palettes with the contract", () => {
    expect(buildThemeColors([])).toEqual({ ...DEFAULT_THEME_COLORS });
  });

  it("keeps an explicit field color", () => {
    expect(deriveFieldColor("#123456", "#000000")).toBe("#123456");
  });

  it("derives white fields for light primaries", () => {
    expect(deriveFieldColor(undefined, "#c0c0c0")).toBe("#ffffff");
  });

  it("derives a darker shade for dark primaries", () => {
    expect(deriveFieldColor(undefined, "#000080")).toBe("#00005a");
  });

  it("maps a base-only import to primary without touching background", () => {
    const parsed = parseRetroismTheme(JSON.stringify({ base: "#abc123" }));
    expect(parsed?.colors.primary).toBe("#abc123");
    expect(parsed?.colors.background).toBe(DEFAULT_THEME_COLORS.background);
  });
});
