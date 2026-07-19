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
    highlight: string;
    destructive: string;
    success: string;
    linkHover: string;
    surface: string;
    winHighlight: string;
    winShadow: string;
  };
}
