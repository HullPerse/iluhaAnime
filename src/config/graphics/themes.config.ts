import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import type {
  ThemeColorKey,
  ThemeDefinition,
  ThemeFamily,
  ThemeOverrideKey,
} from "@/types/graphics/theme";
import data from "./themes.data.json";

const ThemeColorsSchema = z.object({
  autocomplete: z.optional(z.string()),
  autocompleteOpacity: z.optional(z.number()),
  background: z.string(),
  destructive: z.string(),
  field: z.string(),
  highlight: z.string(),
  linkHover: z.string(),
  muted: z.string(),
  primary: z.string(),
  secondary: z.string(),
  success: z.string(),
  surface: z.string(),
  text: z.string(),
  winHighlight: z.string(),
  winShadow: z.string(),
});

const DefaultThemeColorsSchema = z.object({
  autocomplete: z.string(),
  autocompleteOpacity: z.number(),
  background: z.string(),
  destructive: z.string(),
  field: z.string(),
  highlight: z.string(),
  linkHover: z.string(),
  muted: z.string(),
  primary: z.string(),
  secondary: z.string(),
  success: z.string(),
  surface: z.string(),
  text: z.string(),
  winHighlight: z.string(),
  winShadow: z.string(),
});

const ThemeComponentsSchema = z.object({
  cardMeta: z.optional(z.enum(["full", "short"])),
  titlebarArt: z.optional(z.boolean()),
});

const TitlebarGradientSchema = z.object({ from: z.string(), to: z.string() });

const ThemeDefinitionSchema = z.object({
  bevel: z.optional(z.enum(["flat", "raised"])),
  colors: ThemeColorsSchema,
  components: z.optional(ThemeComponentsSchema),
  family: z.optional(z.string()),
  fontFamily: z.optional(z.string()),
  label: z.string(),
  mode: z.optional(z.enum(["dark", "light"])),
  name: z.string(),
  overlay: z.optional(z.enum(["grid", "none", "scanlines"])),
  overrides: z.optional(z.record(z.string(), z.string())),
  radius: z.optional(z.enum(["all", "frame", "none"])),
  titlebarGradient: z.optional(TitlebarGradientSchema),
});

const ThemesDataSchema = z.object({
  defaultThemeColors: DefaultThemeColorsSchema,
  themeAccentExempt: z.array(z.string()),
  themeColorKeys: z.array(z.object({ key: z.string(), label: z.string() })),
  themeFamilies: z.array(z.object({ id: z.string(), label: z.string() })),
  themeOverrideVars: z.record(z.string(), z.string()),
  themes: z.array(ThemeDefinitionSchema),
});

const parsed = ThemesDataSchema.parse(data);

export const DEFAULT_THEME_COLORS = parsed.defaultThemeColors as ThemeDefinition["colors"] & {
  autocomplete: string;
  autocompleteOpacity: number;
};

export const THEME_ACCENT_EXEMPT = parsed.themeAccentExempt;

export const THEME_COLOR_KEYS = parsed.themeColorKeys as {
  key: ThemeColorKey;
  label: TranslationKey;
}[];

export const THEME_FAMILIES = parsed.themeFamilies as { id: ThemeFamily; label: TranslationKey }[];

export const THEME_OVERRIDE_VARS = parsed.themeOverrideVars as Record<ThemeOverrideKey, string>;

export const THEMES = parsed.themes as ThemeDefinition[];
