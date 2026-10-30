import { THEMES } from "@/config/themes.config";
import { resolveTheme } from "@/lib/themeResolve.utils";
import { buildThemeState, THEME_OVERRIDE_BINDINGS, type ThemeState } from "@/lib/tokens.utils";
import { attemptSync, reportBackgroundError } from "@/lib/attempt.utils";
import { DEFAULT_FONT_FAMILY, getStoredAppFont, toCssFontFamily } from "@/lib/font.utils";
import type { ThemeDefinition, ThemePatch } from "@/types/theme";

export const THEME_VARS_SCHEMA = 2;

const THEME_VARS_STORAGE_KEY = "themeVars";

export interface ThemePrePaintPayload {
  schema: number;
  themeName: string;
  vars: Record<string, string>;
  overrides: Record<string, string>;
  datasets: ThemeState["datasets"];
  fontFamily: string | null;
}

export function resolveThemeFont(themeFont: string | null | undefined): string {
  const stored = getStoredAppFont();
  return stored ? toCssFontFamily(stored) : (themeFont ?? DEFAULT_FONT_FAMILY);
}

export function themePrePaintPayload(state: ThemeState): ThemePrePaintPayload {
  return {
    datasets: state.datasets,
    fontFamily: state.fontFamily,
    overrides: state.overrides,
    schema: THEME_VARS_SCHEMA,
    themeName: state.themeName,
    vars: state.vars,
  };
}

function persistThemeState(state: ThemeState): void {
  const [, error] = attemptSync(() =>
    localStorage.setItem(THEME_VARS_STORAGE_KEY, JSON.stringify(themePrePaintPayload(state)))
  );
  if (error !== null) reportBackgroundError("theme.serialize", error);
}

function applyThemeState(state: ThemeState, options: { persist?: boolean } = {}): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;

  for (const [name, value] of Object.entries(state.vars)) {
    root.style.setProperty(name, value, "important");
  }

  for (const binding of THEME_OVERRIDE_BINDINGS) {
    const value = state.overrides[binding.varName];
    if (value === undefined) root.style.removeProperty(binding.varName);
    else root.style.setProperty(binding.varName, value, "important");
  }

  root.style.setProperty("--font-family", resolveThemeFont(state.fontFamily), "important");

  root.dataset.theme = state.datasets.theme;
  root.dataset.radius = state.datasets.radius;
  root.dataset.bevel = state.datasets.bevel;
  root.dataset.themeOverlay = state.datasets.themeOverlay;
  root.dataset.themeTitlebarArt = state.datasets.themeTitlebarArt;

  if (options.persist !== false) persistThemeState(state);
}

function applyThemeDefinition(theme: ThemeDefinition, options: { persist?: boolean } = {}): void {
  applyThemeState(buildThemeState(theme), options);
}

export function applyTheme(
  name: string,
  customThemes: ThemeDefinition[] = [],
  patches: Record<string, ThemePatch> = {}
): void {
  const theme = resolveTheme({ builtins: THEMES, customThemes, name, patch: patches[name] });
  if (theme) applyThemeDefinition(theme);
}

export function previewTheme(theme: ThemeDefinition): void {
  applyThemeDefinition(theme, { persist: false });
}
