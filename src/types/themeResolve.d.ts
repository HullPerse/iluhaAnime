import type { ThemeDefinition, ThemePatch } from "@/types/theme";

export interface ResolveThemeOptions {
  builtins: readonly ThemeDefinition[];
  customThemes?: readonly ThemeDefinition[];
  name: string;
  patch?: ThemePatch;
}
