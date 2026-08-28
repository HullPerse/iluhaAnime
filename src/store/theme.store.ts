import { create } from "zustand";
import { persist } from "zustand/middleware";

import { THEMES } from "@/config/themes.config";
import type { ThemeDefinition, ThemeStore } from "@/types/theme";

function getTitleText(color: string): string {
  const match = color.trim().match(/^#([\da-f]{6})$/i);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return 0.299 * red + 0.587 * green + 0.114 * blue > 160
    ? "#000000"
    : "#ffffff";
}

function parseAutocompleteOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function findTheme(
  name: string,
  custom: ThemeDefinition[]
): ThemeDefinition | undefined {
  return (
    THEMES.find((t) => t.name === name) ?? custom.find((t) => t.name === name)
  );
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
  root.style.setProperty(
    "--autocomplete-opacity",
    String(autocompleteOpacity),
    "important"
  );
  root.style.setProperty("--color-highlight", c.highlight, "important");
  root.style.setProperty("--color-destructive", c.destructive, "important");
  root.style.setProperty("--color-success", c.success, "important");
  root.style.setProperty("--color-link-hover", c.linkHover, "important");
  root.style.setProperty("--color-surface", c.surface, "important");
  root.style.setProperty("--color-win-highlight", c.winHighlight, "important");
  root.style.setProperty("--color-win-shadow", c.winShadow, "important");
  root.style.setProperty(
    "--color-title-text",
    getTitleText(c.secondary),
    "important"
  );
  if (root.dataset) root.dataset.theme = theme.name;
  root.style.setProperty(
    "--font-family",
    theme.fontFamily ??
      "MS Sans Serif, Microsoft Sans Serif, Segoe UI, system-ui",
    "important"
  );

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
  } catch {}
}

export function themeToJson(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

function themeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function parseRetroismColors(c: Record<string, unknown>): ThemeDefinition["colors"] | null {
  if (!c.base && !c.primary) return null;
  const muted = themeString(c.muted ?? c.shadow, "#808080");
  return {
    background: themeString(c.background ?? c.base, "#222222"),
    destructive: themeString(c.destructive ?? c.urgent, "#800000"),
    highlight: themeString(c.highlight, "#0000ff"),
    linkHover: themeString(c.link_hover ?? c.linkHover, "#ff0000"),
    muted,
    autocomplete: parseHexColor(c.autocomplete, muted),
    autocompleteOpacity: parseAutocompleteOpacity(c.autocompleteOpacity),
    primary: themeString(c.primary ?? c.base, "#c0c0c0"),
    secondary: themeString(c.secondary ?? c.accent, "#000080"),
    success: themeString(c.success, "#008000"),
    surface: themeString(c.surface, "#d0d0d0"),
    text: themeString(c.text, "#000000"),
    winHighlight: themeString(c.win_highlight ?? c.winHighlight ?? c.highlight, "#ffffff"),
    winShadow: themeString(c.win_shadow ?? c.winShadow ?? c.shadow, muted),
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
