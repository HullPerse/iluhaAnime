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
    /** Ghost-text color for inline autocomplete. Falls back to muted for old themes. */
    autocomplete?: string;
    /** Ghost-text opacity from 0 to 1. Falls back to 0.6 for old themes. */
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
