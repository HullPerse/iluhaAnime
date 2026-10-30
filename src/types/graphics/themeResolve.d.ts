import type { ThemeDefinition, ThemePatch } from "@/types/graphics/theme";

export interface ResolveThemeOptions {
  builtins: readonly ThemeDefinition[];
  customThemes?: readonly ThemeDefinition[];
  name: string;
  patch?: ThemePatch;
}
