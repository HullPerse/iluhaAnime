import { THEME_OVERRIDE_VARS } from "@/config/themes.config";
import { deriveFieldColor, getTitleText, isHexColor, windowTintAlpha } from "@/lib/palette.utils";
import type { ThemeDefinition, ThemeOverrideKey } from "@/types/theme";
import type { ThemeOverrideBinding, ThemeState, ThemeVarBinding } from "@/types/tokens";

export function normalizeAutocompleteOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.6;
  return Math.max(0, Math.min(1, value));
}

export const THEME_VAR_BINDINGS: readonly ThemeVarBinding[] = [
  { derive: (theme) => theme.colors.background, varName: "--color-background" },
  { derive: (theme) => theme.colors.primary, varName: "--color-primary" },
  { derive: (theme) => theme.colors.secondary, varName: "--color-secondary" },
  { derive: (theme) => theme.colors.text, varName: "--color-text" },
  { derive: (theme) => theme.colors.muted, varName: "--color-muted" },
  {
    derive: (theme) =>
      isHexColor(theme.colors.autocomplete) ? theme.colors.autocomplete : theme.colors.muted,
    varName: "--color-autocomplete",
  },
  {
    derive: (theme) => String(normalizeAutocompleteOpacity(theme.colors.autocompleteOpacity)),
    varName: "--autocomplete-opacity",
  },
  { derive: (theme) => theme.colors.highlight, varName: "--color-highlight" },
  { derive: (theme) => theme.colors.destructive, varName: "--color-destructive" },
  { derive: (theme) => theme.colors.success, varName: "--color-success" },
  { derive: (theme) => theme.colors.linkHover, varName: "--color-link-hover" },
  { derive: (theme) => theme.colors.surface, varName: "--color-surface" },
  {
    derive: (theme) => deriveFieldColor(theme.colors.field, theme.colors.primary),
    varName: "--color-field",
  },
  { derive: (theme) => theme.colors.winHighlight, varName: "--color-win-highlight" },
  { derive: (theme) => theme.colors.winShadow, varName: "--color-win-shadow" },
  { derive: (theme) => getTitleText(theme.colors.secondary), varName: "--color-title-text" },
  {
    derive: (theme) => theme.titlebarGradient?.from ?? theme.colors.secondary,
    varName: "--titlebar-from",
  },
  {
    derive: (theme) => theme.titlebarGradient?.to ?? theme.colors.secondary,
    varName: "--titlebar-to",
  },
  {
    derive: (theme) =>
      `${Math.round(windowTintAlpha(theme.colors.primary, theme.colors.text) * 100)}%`,
    varName: "--ui-window-alpha",
  },
];

export const THEME_OVERRIDE_BINDINGS: readonly ThemeOverrideBinding[] = (
  Object.keys(THEME_OVERRIDE_VARS) as ThemeOverrideKey[]
).map((key) => ({ key, varName: THEME_OVERRIDE_VARS[key] as `--${string}` }));

export function buildThemeState(theme: ThemeDefinition): ThemeState {
  const vars: Record<string, string> = {};
  for (const binding of THEME_VAR_BINDINGS) {
    vars[binding.varName] = binding.derive(theme);
  }

  const overrides: Record<string, string> = {};
  for (const binding of THEME_OVERRIDE_BINDINGS) {
    const value = theme.overrides?.[binding.key];
    if (value !== undefined) overrides[binding.varName] = value;
  }

  return {
    datasets: {
      bevel: theme.bevel ?? "raised",
      radius: theme.radius ?? "none",
      theme: theme.name,
      themeOverlay: theme.overlay ?? "none",
      themeTitlebarArt: theme.components?.titlebarArt === true ? "on" : "off",
    },
    fontFamily: theme.fontFamily ?? null,
    overrides,
    themeName: theme.name,
    vars,
  };
}
