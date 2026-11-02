import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import type { WallpaperDisplayFilters, WallpaperShadowSides } from "@/types/ui/settings";
import data from "./wallpaper.data.json";

const FiltersSchema = z.object({
  blur: z.number(),
  brightness: z.number(),
  contrast: z.number(),
  opacity: z.number(),
  saturate: z.number(),
});

const PresetSchema = z.object({
  filters: FiltersSchema,
  id: z.string(),
  label: z.string(),
});

const SliderSchema = z.object({
  key: z.string(),
  label: z.string(),
  max: z.number(),
  min: z.number(),
  step: z.number(),
});

const WallpaperDataSchema = z.object({
  WALLPAPER_DISPLAY_PRESETS: z.array(PresetSchema),
  WALLPAPER_DISPLAY_SLIDERS: z.array(SliderSchema),
  WALLPAPER_LOAD_RETRIES: z.number(),
  WALLPAPER_MAX_DPR: z.number(),
  WALLPAPER_SHADOW_SIDE_KEYS: z.array(z.string()),
});

const parsed = WallpaperDataSchema.parse(data);

export const WALLPAPER_MAX_DPR = parsed.WALLPAPER_MAX_DPR;
export const WALLPAPER_LOAD_RETRIES = parsed.WALLPAPER_LOAD_RETRIES;
export const WALLPAPER_SHADOW_SIDE_KEYS = parsed.WALLPAPER_SHADOW_SIDE_KEYS as readonly (keyof WallpaperShadowSides)[];
export const WALLPAPER_DISPLAY_PRESETS = parsed.WALLPAPER_DISPLAY_PRESETS as readonly {
  id: string;
  label: TranslationKey;
  filters: WallpaperDisplayFilters;
}[];
export const WALLPAPER_DISPLAY_SLIDERS = parsed.WALLPAPER_DISPLAY_SLIDERS as readonly {
  key: keyof WallpaperDisplayFilters;
  label: TranslationKey;
  min: number;
  max: number;
  step: number;
}[];