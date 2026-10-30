import type { ThemeDefinition, ThemeOverrideKey } from "@/types/graphics/theme";

export interface ThemeVarBinding {
  varName: `--${string}`;
  derive: (theme: ThemeDefinition) => string;
}

export interface ThemeOverrideBinding {
  key: ThemeOverrideKey;
  varName: `--${string}`;
}

export interface ThemeDatasets {
  theme: string;
  radius: NonNullable<ThemeDefinition["radius"]>;
  bevel: NonNullable<ThemeDefinition["bevel"]>;
  themeOverlay: NonNullable<ThemeDefinition["overlay"]>;
  themeTitlebarArt: "on" | "off";
}

export interface ThemeState {
  themeName: string;
  vars: Record<string, string>;
  overrides: Record<string, string>;
  datasets: ThemeDatasets;
  fontFamily: string | null;
}
