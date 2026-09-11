import { create } from "zustand";
import { persist } from "zustand/middleware";

import { THEMES } from "@/config/settings/themes.config";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { DEFAULT_FONT_FAMILY, getStoredAppFont, toCssFontFamily } from "@/lib/utils/font.utils";
import type { ThemeDefinition, ThemeStore } from "@/types/theme";

function getTitleText(color: string): string {
  const match = color.trim().match(/^#([\da-f]{6})$/i);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return 0.299 * red + 0.587 * green + 0.114 * blue > 160 ? "#000000" : "#ffffff";
}

function parseAutocompleteOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
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
  root.style.setProperty("--color-win-highlight", c.winHighlight, "important");
  root.style.setProperty("--color-win-shadow", c.winShadow, "important");
  if (root.dataset) root.dataset.theme = theme.name;
  const storedAppFont = getStoredAppFont();
  const fontCss = storedAppFont
    ? toCssFontFamily(storedAppFont)
    : (theme.fontFamily ?? DEFAULT_FONT_FAMILY);
  root.style.setProperty("--font-family", fontCss, "important");

  try {
    localStorage.setItem(
      "themeVars",
      JSON.stringify({
        autocomplete,
        autocompleteOpacity,
        background: c.background,
        destructive: c.destructive,
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
        titleText: getTitleText(c.secondary),
        winHighlight: c.winHighlight,
        winShadow: c.winShadow,
      })
    );
  } catch (error) {
    reportBackgroundError("theme.serialize", error);
  }
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
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const c = (raw.colors ?? raw) as Record<string, unknown>;
    const colors = parseRetroismColors(c);
    if (!colors) return null;
    return {
      colors,
      fontFamily: (raw.fontFamily ?? c.font_family) as string | undefined,
      label: (raw.label ?? raw.name ?? "Imported") as string,
      name: (raw.name ?? `custom-${Date.now()}`) as string,
    };
  } catch {
    return null;
  }
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
