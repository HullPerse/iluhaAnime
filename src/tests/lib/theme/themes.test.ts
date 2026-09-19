import { describe, expect, it } from "vitest";

import { THEMES, THEME_ACCENT_EXEMPT } from "@/config/settings/themes.config";
import {
  colorDistance,
  contrastRatio,
  hexToRgb,
  rgbToHex,
  windowTintAlpha,
  WINDOW_TINT_MAX,
  WINDOW_TINT_MIN,
} from "@/lib/theme/palette.utils";
import { getTitleText } from "@/store/theme.store";

/**
 * Smallest RGB distance two tokens may have and still be told apart side by side.
 * The same idea as `quantizePalette`'s dedup distance, tuned for tokens that are
 * often rendered as two dots or two words next to each other.
 */
const MIN_COLOR_DISTANCE = 32;

/** WCAG AA for normal text. */
const MIN_CONTRAST = 4.5;

/** Status and graph colours are derived from these four accents. */
const ACCENT_KEYS = ["highlight", "linkHover", "success", "destructive"] as const;

const STATUS_KEYS = ["downloading", "seeding", "done", "error", "idle", "missing"] as const;

/** Mirrors the derivation in `index.css` plus the theme's own overrides. */
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

/** Blends a theme face over a desktop colour the way the compositor would. */
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

  it("declares windows themes first, oldest to newest", () => {
    expect(THEMES.slice(0, 5).map((theme) => theme.name)).toEqual([
      "win95",
      "win2000",
      "xp",
      "win7",
      "win11",
    ]);
  });

  it("keeps the other platform identities right after the windows group", () => {
    const platforms = THEMES.slice(5, 7).map((theme) => theme.name);
    expect(platforms).toEqual(["google", "apple"]);
    for (const name of platforms) {
      const theme = THEMES.find((item) => item.name === name)!;
      expect(theme.radius, name).toBe("all");
      expect(theme.bevel, name).toBe("flat");
      expect(theme.titlebarGradient, name).toBeUndefined();
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

describe("theme shape metadata", () => {
  it("gives the rounded themes a radius preset and leaves the rest square", () => {
    const rounded = THEMES.filter((theme) => theme.radius !== undefined).map((theme) => theme.name);
    expect(rounded).toEqual(["xp", "win7", "win11", "google", "apple"]);
    expect(THEMES.find((theme) => theme.name === "win11")?.radius).toBe("all");
    expect(THEMES.find((theme) => theme.name === "google")?.radius).toBe("all");
    expect(THEMES.find((theme) => theme.name === "win95")?.radius).toBeUndefined();
  });

  it("gives the aero and fluent themes a flat bevel", () => {
    const flat = THEMES.filter((theme) => theme.bevel === "flat").map((theme) => theme.name);
    expect(flat).toEqual(["win7", "win11", "google", "apple"]);
    expect(THEMES.find((theme) => theme.name === "xp")?.bevel).toBe("raised");
  });

  it("paints a titlebar wash for the themes that need one", () => {
    for (const name of ["xp", "win7"]) {
      const theme = THEMES.find((item) => item.name === name)!;
      expect(theme.titlebarGradient, name).toBeDefined();
      expect(
        colorDistance(theme.titlebarGradient!.from, theme.titlebarGradient!.to),
        name
      ).toBeGreaterThanOrEqual(MIN_COLOR_DISTANCE);
    }
    expect(THEMES.find((theme) => theme.name === "win95")?.titlebarGradient).toBeUndefined();
  });

  it("only overrides tokens for themes that need to leave the derivation", () => {
    const overriding = THEMES.filter((theme) => theme.overrides !== undefined).map((t) => t.name);
    expect(overriding).toEqual(["mono", "game-boy"]);
  });
});
