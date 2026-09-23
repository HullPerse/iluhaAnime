export interface ThemeDefinition {
  name: string;
  label: string;
  fontFamily?: string;
  radius?: "none" | "frame" | "all";
  bevel?: "raised" | "flat";
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
  | "torrentIdle"
  | "torrentMissing";

export type ThemeOverrides = Partial<Record<ThemeOverrideKey, string>>;

export interface ThemeStore {
  currentTheme: string;
  customThemes: ThemeDefinition[];
  setTheme: (name: string) => void;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (name: string) => void;
}

export type ThemeColorKey = Exclude<keyof ThemeDefinition["colors"], "autocompleteOpacity">;
