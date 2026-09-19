export interface ThemeDefinition {
  name: string;
  label: string;
  fontFamily?: string;
  /**
   * Corner preset. `frame` rounds only window frames (Windows XP, Windows 7),
   * `all` also rounds controls (Windows 11). Absent means the square win95 look.
   */
  radius?: "none" | "frame" | "all";
  /** `flat` swaps the 2px win95 bevel for 1px borders with a hairline highlight. */
  bevel?: "raised" | "flat";
  /** Two-stop titlebar wash. Themes without it keep the flat accent colour. */
  titlebarGradient?: { from: string; to: string };
  /** Colours for tokens that otherwise follow the accent set: status, graph and favourite gold. */
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
