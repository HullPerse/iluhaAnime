export type ThemeFamily = "windows" | "brands" | "terminal" | "editor" | "anime";

export interface ThemeDefinition {
  name: string;
  label: string;
  family?: ThemeFamily;
  fontFamily?: string;
  radius?: "none" | "frame" | "all";
  bevel?: "raised" | "flat";
  overlay?: "none" | "scanlines" | "grid";
  components?: ThemeComponents;
  titlebarGradient?: { from: string; to: string };
  overrides?: ThemeOverrides;
  colors: {
    background: string;
    primary: string;
    secondary: string;
    text: string;
    muted: string;
    autocomplete?: string;
    autocompleteOpacity?: number;
    highlight: string;
    destructive: string;
    success: string;
    linkHover: string;
    surface: string;
    field: string;
    winHighlight: string;
    winShadow: string;
  };
}

export type ThemeOverrideKey =
  | "favGold"
  | "graphDefault"
  | "graphLight"
  | "graphPale"
  | "graphPrequel"
  | "graphSequel"
  | "graphSide"
  | "graphSpinoff"
  | "torrentDownloading"
  | "torrentSeeding"
  | "torrentDone"
  | "torrentError"
  | "torrentInitializing"
  | "torrentIdle"
  | "torrentMissing"
  | "progressMain";

export type ThemeOverrides = Partial<Record<ThemeOverrideKey, string>>;

export interface ThemeComponents {
  titlebarArt?: boolean;
  cardMeta?: "full" | "short";
}

export interface ThemePatch {
  colors?: Partial<ThemeDefinition["colors"]>;
  radius?: ThemeDefinition["radius"];
  bevel?: ThemeDefinition["bevel"];
  overlay?: ThemeDefinition["overlay"];
  // Components and overrides replace the base maps, so {} clears them.
  components?: ThemeComponents;
  titlebarGradient?: ThemeDefinition["titlebarGradient"];
  overrides?: ThemeOverrides;
  fontFamily?: string;
}

export interface ThemeStore {
  currentTheme: string;
  customThemes: ThemeDefinition[];
  themePatches: Record<string, ThemePatch>;
  setTheme: (name: string) => void;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (name: string) => void;
  setThemePatch: (name: string, patch: ThemePatch) => void;
  clearThemePatch: (name: string) => void;
}

export type ThemeColorKey = Exclude<keyof ThemeDefinition["colors"], "autocompleteOpacity">;
