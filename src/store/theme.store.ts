import { create } from "zustand";
import { persist } from "zustand/middleware";

import { THEMES, THEME_OVERRIDE_VARS } from "@/config/settings/themes.config";
import {
  contrastRatio,
  hexToRgb,
  relativeLuminance,
  shade,
  windowTintAlpha,
} from "@/lib/theme/palette.utils";
import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { DEFAULT_FONT_FAMILY, getStoredAppFont, toCssFontFamily } from "@/lib/utils/font.utils";
import type { ThemeDefinition, ThemeOverrideKey, ThemeStore } from "@/types/theme";

export function getTitleText(color: string): string {
  if (hexToRgb(color) === null) return "#ffffff";
  const dark = contrastRatio(color, "#000000");
  const light = contrastRatio(color, "#ffffff");
  return dark >= light ? "#000000" : "#ffffff";
}

function parseRadius(value: unknown): ThemeDefinition["radius"] {
  return value === "frame" || value === "all" || value === "none" ? value : undefined;
}

function parseBevel(value: unknown): ThemeDefinition["bevel"] {
  return value === "flat" || value === "raised" ? value : undefined;
}

function parseTitlebarGradient(value: unknown): ThemeDefinition["titlebarGradient"] {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (!/^#[\da-f]{6}$/i.test(String(record.from)) || !/^#[\da-f]{6}$/i.test(String(record.to))) {
    return undefined;
  }
  return { from: String(record.from), to: String(record.to) };
}

function parseOverrides(value: unknown): ThemeDefinition["overrides"] {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const overrides: Partial<Record<ThemeOverrideKey, string>> = {};
  for (const key of Object.keys(THEME_OVERRIDE_VARS) as ThemeOverrideKey[]) {
    const color = record[key];
    if (typeof color === "string" && /^#[\da-f]{6}$/i.test(color)) overrides[key] = color;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function parseAutocompleteOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function resolveField(field: unknown, primary: string): string {
  const rgb = hexToRgb(primary);
  const derived = rgb === null || relativeLuminance(rgb) >= 0.5 ? "#ffffff" : shade(primary, -0.3);
  return parseHexColor(field, derived);
}

function findTheme(name: string, custom: ThemeDefinition[]): ThemeDefinition | undefined {
  return THEMES.find((t) => t.name === name) ?? custom.find((t) => t.name === name);
}

export function applyTheme(name: string, customThemes: ThemeDefinition[] = []) {
  const theme = findTheme(name, customThemes);
  if (!theme) return;
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  const c = theme.colors;
  const autocomplete = parseHexColor(c.autocomplete, c.muted);
  const autocompleteOpacity = parseAutocompleteOpacity(c.autocompleteOpacity);
  const titleText = getTitleText(c.secondary);
  root.style.setProperty("--color-background", c.background, "important");
  root.style.setProperty("--color-primary", c.primary, "important");
  root.style.setProperty("--color-secondary", c.secondary, "important");
  root.style.setProperty("--color-text", c.text, "important");
  root.style.setProperty("--color-muted", c.muted, "important");
  root.style.setProperty("--color-autocomplete", autocomplete, "important");
  root.style.setProperty("--autocomplete-opacity", String(autocompleteOpacity), "important");
  root.style.setProperty("--color-highlight", c.highlight, "important");
  root.style.setProperty("--color-destructive", c.destructive, "important");
  root.style.setProperty("--color-success", c.success, "important");
  root.style.setProperty("--color-link-hover", c.linkHover, "important");
  root.style.setProperty("--color-surface", c.surface, "important");
  root.style.setProperty("--color-field", resolveField(c.field, c.primary), "important");
  root.style.setProperty("--color-win-highlight", c.winHighlight, "important");
  root.style.setProperty("--color-win-shadow", c.winShadow, "important");
  root.style.setProperty("--color-title-text", titleText, "important");
  root.style.setProperty(
    "--titlebar-from",
    theme.titlebarGradient?.from ?? c.secondary,
    "important"
  );
  root.style.setProperty("--titlebar-to", theme.titlebarGradient?.to ?? c.secondary, "important");
  const windowAlpha = `${Math.round(windowTintAlpha(c.primary, c.text) * 100)}%`;
  root.style.setProperty("--ui-window-alpha", windowAlpha, "important");

  for (const key of Object.keys(THEME_OVERRIDE_VARS) as ThemeOverrideKey[]) {
    const variable = THEME_OVERRIDE_VARS[key];
    const override = theme.overrides?.[key];
    if (override === undefined) root.style.removeProperty(variable);
    else root.style.setProperty(variable, override, "important");
  }
  if (root.dataset) {
    root.dataset.theme = theme.name;
    root.dataset.radius = theme.radius ?? "none";
    root.dataset.bevel = theme.bevel ?? "raised";
  }
  const storedAppFont = getStoredAppFont();
  const fontCss = storedAppFont
    ? toCssFontFamily(storedAppFont)
    : (theme.fontFamily ?? DEFAULT_FONT_FAMILY);
  root.style.setProperty("--font-family", fontCss, "important");

  const [, serializeError] = attemptSync(() =>
    localStorage.setItem(
      "themeVars",
      JSON.stringify({
        autocomplete,
        autocompleteOpacity,
        background: c.background,
        destructive: c.destructive,
        field: c.field,
        fontFamily: theme.fontFamily ?? null,
        highlight: c.highlight,
        linkHover: c.linkHover,
        muted: c.muted,
        primary: c.primary,
        secondary: c.secondary,
        success: c.success,
        surface: c.surface,
        text: c.text,
        themeName: theme.name,
        titleText,
        winHighlight: c.winHighlight,
        winShadow: c.winShadow,
        windowAlpha,
      })
    )
  );
  if (serializeError !== null) reportBackgroundError("theme.serialize", serializeError);
}

export function themeToJson(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

function firstString(c: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = c[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function pickString(c: Record<string, unknown>, keys: string[], fallback: string): string {
  const found = firstString(c, keys);
  return typeof found === "string" ? found : fallback;
}

function parseRetroismColors(c: Record<string, unknown>): ThemeDefinition["colors"] | null {
  if (!c.base && !c.primary) return null;
  const muted = pickString(c, ["muted", "shadow"], "#808080");
  return {
    background: pickString(c, ["background", "base"], "#222222"),
    destructive: pickString(c, ["destructive", "urgent"], "#800000"),
    field: pickString(c, ["field", "input", "base"], "#ffffff"),
    highlight: pickString(c, ["highlight"], "#0000ff"),
    linkHover: pickString(c, ["link_hover", "linkHover"], "#ff0000"),
    muted,
    autocomplete: parseHexColor(c.autocomplete, muted),
    autocompleteOpacity: parseAutocompleteOpacity(c.autocompleteOpacity),
    primary: pickString(c, ["primary", "base"], "#c0c0c0"),
    secondary: pickString(c, ["secondary", "accent"], "#000080"),
    success: pickString(c, ["success"], "#008000"),
    surface: pickString(c, ["surface"], "#d0d0d0"),
    text: pickString(c, ["text"], "#000000"),
    winHighlight: pickString(c, ["win_highlight", "winHighlight", "highlight"], "#ffffff"),
    winShadow: pickString(c, ["win_shadow", "winShadow", "shadow"], muted),
  };
}
export function parseRetroismTheme(json: string): ThemeDefinition | null {
  const [raw, error] = attemptSync(() => JSON.parse(json) as Record<string, unknown>);
  if (error !== null) return null;
  const c = (raw.colors ?? raw) as Record<string, unknown>;
  const colors = parseRetroismColors(c);
  if (!colors) return null;
  return {
    bevel: parseBevel(raw.bevel),
    colors,
    fontFamily: (raw.fontFamily ?? c.font_family) as string | undefined,
    label: (raw.label ?? raw.name ?? "Imported") as string,
    name: (raw.name ?? `custom-${Date.now()}`) as string,
    overrides: parseOverrides(raw.overrides),
    radius: parseRadius(raw.radius),
    titlebarGradient: parseTitlebarGradient(raw.titlebarGradient),
  };
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      addCustomTheme: (theme) => {
        const existing = get().customThemes.find((t) => t.name === theme.name);
        const next = existing
          ? get().customThemes.map((t) => (t.name === theme.name ? theme : t))
          : [...get().customThemes, theme];
        set({ customThemes: next });
      },
      currentTheme: "win95",
      customThemes: [],
      removeCustomTheme: (name) => {
        set({
          customThemes: get().customThemes.filter((t) => t.name !== name),
        });
        if (get().currentTheme === name) {
          applyTheme("win95");
          set({ currentTheme: "win95" });
        }
      },
      setTheme: (name) => {
        applyTheme(name, get().customThemes);
        set({ currentTheme: name });
      },
    }),
    {
      name: "themeState",
      onRehydrateStorage: (state) => {
        if (state) applyTheme(state.currentTheme, state.customThemes);
      },
    }
  )
);

const s = useThemeStore.getState();
applyTheme(s.currentTheme, s.customThemes);
