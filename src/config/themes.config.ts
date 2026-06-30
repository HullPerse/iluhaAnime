import type { ThemeDefinition } from "@/types/theme";
import { generateFromAccent } from "@/lib/theme-gen.utils";

const configThemes: {
  value: string;
  label: string;
  primary: string;
  background: string;
}[] = [
  {
    value: "paleGold",
    label: "Бледно золотой",
    primary: "#8E4585",
    background: "#E6BE8A",
  },
];

const generated = configThemes.map((t) => ({
  name: t.value,
  label: t.label,
  colors: generateFromAccent(t.primary, t.background),
})) satisfies ThemeDefinition[];

export const THEMES: ThemeDefinition[] = [
  {
    name: "win95",
    label: "Windows 95",
    colors: {
      background: "#222222",
      primary: "#c0c0c0",
      secondary: "#000080",
      text: "#000000",
      muted: "#808080",
      highlight: "#0000ff",
      destructive: "#800000",
      success: "#008000",
      linkHover: "#ff0000",
      surface: "#d0d0d0",
      winHighlight: "#ffffff",
      winShadow: "#808080",
    },
  },
  {
    name: "retroism",
    label: "Retroism",
    fontFamily: "Perfect DOS VGA 437",
    colors: {
      background: "#1a1a1a",
      primary: "#d8d8d8",
      secondary: "#207874",
      text: "#000000",
      muted: "#9b9b9b",
      highlight: "#207874",
      destructive: "#ff723e",
      success: "#207874",
      linkHover: "#ff0000",
      surface: "#e8e8e8",
      winHighlight: "#efefef",
      winShadow: "#9b9b9b",
    },
  },
  {
    name: "yorha",
    label: "YoRHa",
    colors: {
      background: "#1a1a1a",
      primary: "#dad4bb",
      secondary: "#57544a",
      text: "#000000",
      muted: "#979381",
      highlight: "#cd664d",
      destructive: "#cd664d",
      success: "#57544a",
      linkHover: "#cd664d",
      surface: "#c8c3ae",
      winHighlight: "#e5dfc8",
      winShadow: "#979381",
    },
  },
  {
    name: "cherry",
    label: "Cherry",
    colors: {
      background: "#1a1a1a",
      primary: "#f4c9ef",
      secondary: "#c950bb",
      text: "#000000",
      muted: "#b08aaa",
      highlight: "#c950bb",
      destructive: "#d43e6a",
      success: "#c950bb",
      linkHover: "#ff0000",
      surface: "#f7d5f3",
      winHighlight: "#fadef6",
      winShadow: "#b08aaa",
    },
  },
  {
    name: "indigo",
    label: "Indigo",
    colors: {
      background: "#1a1a1a",
      primary: "#bac4e6",
      secondary: "#3e7c99",
      text: "#000000",
      muted: "#8a94b0",
      highlight: "#3e7c99",
      destructive: "#d45e3e",
      success: "#3e7c99",
      linkHover: "#ff0000",
      surface: "#ccd3ee",
      winHighlight: "#d5dbf2",
      winShadow: "#8a94b0",
    },
  },
  {
    name: "gleep",
    label: "Gleep",
    colors: {
      background: "#1a1a1a",
      primary: "#bae6c5",
      secondary: "#3e9949",
      text: "#000000",
      muted: "#8ab094",
      highlight: "#3e9949",
      destructive: "#d4663e",
      success: "#3e9949",
      linkHover: "#ff0000",
      surface: "#ccefd5",
      winHighlight: "#d5f2dc",
      winShadow: "#8ab094",
    },
  },

  ...generated,
];
