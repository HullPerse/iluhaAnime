export interface ThemeDefinition {
  name: string;
  label: string;
  fontFamily?: string;
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
    winHighlight: string;
    winShadow: string;
  };
}

export interface ThemeStore {
  currentTheme: string;
  customThemes: ThemeDefinition[];
  setTheme: (name: string) => void;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (name: string) => void;
}

export type ThemeColorKey = Exclude<keyof ThemeDefinition["colors"], "autocompleteOpacity">;
