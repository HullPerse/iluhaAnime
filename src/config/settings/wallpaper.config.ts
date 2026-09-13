import { DEFAULT_WALLPAPER_FILTERS } from "@/config/settings/defaults.config";
import type { TranslationKey } from "@/types/i18n";
import type { WallpaperDisplayFilters, WallpaperShadowSides } from "@/types/settings";

export const WALLPAPER_MAX_DPR = 2;
export const WALLPAPER_LOAD_RETRIES = 2;

export const WALLPAPER_SHADOW_SIDE_KEYS: readonly (keyof WallpaperShadowSides)[] = [
  "top",
  "right",
  "bottom",
  "left",
];

export const WALLPAPER_DISPLAY_PRESETS: readonly {
  id: string;
  label: TranslationKey;
  filters: WallpaperDisplayFilters;
}[] = [
  {
    id: "normal",
    label: "search.dither.display.preset.normal",
    filters: { ...DEFAULT_WALLPAPER_FILTERS },
  },
  {
    id: "dark",
    label: "search.dither.display.preset.dark",
    filters: { brightness: 55, contrast: 100, saturate: 90, blur: 0, opacity: 100 },
  },
  {
    id: "bright",
    label: "search.dither.display.preset.bright",
    filters: { brightness: 95, contrast: 110, saturate: 120, blur: 0, opacity: 100 },
  },
  {
    id: "focus",
    label: "search.dither.display.preset.focus",
    filters: { brightness: 75, contrast: 100, saturate: 100, blur: 6, opacity: 100 },
  },
];

export const WALLPAPER_DISPLAY_SLIDERS: readonly {
  key: keyof WallpaperDisplayFilters;
  label: TranslationKey;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "brightness", label: "search.dither.display.brightness", min: 0, max: 200, step: 5 },
  { key: "contrast", label: "search.dither.display.contrast", min: 0, max: 200, step: 5 },
  { key: "saturate", label: "search.dither.display.saturate", min: 0, max: 200, step: 5 },
  { key: "blur", label: "search.dither.display.blur", min: 0, max: 20, step: 1 },
  { key: "opacity", label: "search.dither.display.opacity", min: 0, max: 100, step: 5 },
];
