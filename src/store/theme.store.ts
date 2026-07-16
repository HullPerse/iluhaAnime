import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEMES } from "@/config/themes.config";
import type { ThemeDefinition } from "@/types/theme";

export interface ThemeStore {
  currentTheme: string;
  customThemes: ThemeDefinition[];
  setTheme: (name: string) => void;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (name: string) => void;
}

function findTheme(name: string, custom: ThemeDefinition[]): ThemeDefinition | undefined {
  return THEMES.find((t) => t.name === name) ?? custom.find((t) => t.name === name);
}

export function applyTheme(name: string, customThemes: ThemeDefinition[] = []) {
  const theme = findTheme(name, customThemes);
  if (!theme) return;
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty("--color-background", c.background, "important");
  root.style.setProperty("--color-primary", c.primary, "important");
  root.style.setProperty("--color-secondary", c.secondary, "important");
  root.style.setProperty("--color-text", c.text, "important");
  root.style.setProperty("--color-muted", c.muted, "important");
  root.style.setProperty("--color-highlight", c.highlight, "important");
  root.style.setProperty("--color-destructive", c.destructive, "important");
  root.style.setProperty("--color-success", c.success, "important");
  root.style.setProperty("--color-link-hover", c.linkHover, "important");
  root.style.setProperty("--color-surface", c.surface, "important");
  root.style.setProperty("--color-win-highlight", c.winHighlight, "important");
  root.style.setProperty("--color-win-shadow", c.winShadow, "important");
  root.style.setProperty(
    "--font-family",
    theme.fontFamily ?? "MS Sans Serif, Microsoft Sans Serif, Segoe UI, system-ui",
    "important",
  );

  try {
    localStorage.setItem("themeVars", JSON.stringify({
      background: c.background,
      primary: c.primary,
      secondary: c.secondary,
      text: c.text,
      muted: c.muted,
      highlight: c.highlight,
      destructive: c.destructive,
      success: c.success,
      linkHover: c.linkHover,
      surface: c.surface,
      winHighlight: c.winHighlight,
      winShadow: c.winShadow,
      fontFamily: theme.fontFamily ?? null,
    }));
  } catch {}
}

export function themeToJson(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

export function parseRetroismTheme(json: string): ThemeDefinition | null {
  try {
    const raw = JSON.parse(json);
    const name = raw.name ?? `custom-${Date.now()}`;
    const label = raw.label ?? raw.name ?? "Imported";
    const c = raw.colors ?? raw;

    if (c.base || c.primary) {
      return {
        name,
        label,
        colors: {
          background: c.background ?? c.base ?? "#222222",
          primary: c.primary ?? c.base ?? "#c0c0c0",
          secondary: c.secondary ?? c.accent ?? "#000080",
          text: c.text ?? "#000000",
          muted: c.muted ?? c.shadow ?? "#808080",
          highlight: c.highlight ?? "#0000ff",
          destructive: c.destructive ?? c.urgent ?? "#800000",
          success: c.success ?? "#008000",
          linkHover: c.link_hover ?? c.linkHover ?? "#ff0000",
          surface: c.surface ?? "#d0d0d0",
          winHighlight: c.win_highlight ?? c.winHighlight ?? c.highlight ?? "#ffffff",
          winShadow: c.win_shadow ?? c.winShadow ?? c.shadow ?? "#808080",
        },
        fontFamily: raw.fontFamily ?? c.font_family ?? undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentTheme: "win95",
      customThemes: [],

      setTheme: (name) => {
        applyTheme(name, get().customThemes);
        set({ currentTheme: name });
      },

      addCustomTheme: (theme) => {
        const existing = get().customThemes.find((t) => t.name === theme.name);
        const next = existing
          ? get().customThemes.map((t) => (t.name === theme.name ? theme : t))
          : [...get().customThemes, theme];
        set({ customThemes: next });
      },

      removeCustomTheme: (name) => {
        set({ customThemes: get().customThemes.filter((t) => t.name !== name) });
        if (get().currentTheme === name) {
          applyTheme("win95");
          set({ currentTheme: "win95" });
        }
      },
    }),
    {
      name: "themeState",
      onRehydrateStorage: (state) => {
        if (state) applyTheme(state.currentTheme, state.customThemes);
      },
    },
  ),
);
