import * as z from "zod/mini";

import { DEFAULT_STREAM_QUALITY } from "@/config/player/quality.config";
import { DEFAULT_TAG_TOLERANCES } from "@/config/graphics/tolerance.config";
import type {
  SettingsDefaults,
  WallpaperDisplayFilters,
  WallpaperShadow,
} from "@/types/ui/settings";
import data from "./settingsDefaults.data.json";

const WallpaperFiltersSchema = z.object({
  blur: z.number(),
  brightness: z.number(),
  contrast: z.number(),
  opacity: z.number(),
  saturate: z.number(),
});

const WallpaperShadowSchema = z.object({
  color: z.string(),
  intensity: z.number(),
  length: z.number(),
  sides: z.object({ bottom: z.boolean(), left: z.boolean(), right: z.boolean(), top: z.boolean() }),
  softness: z.number(),
});

const SettingsDefaultsDataSchema = z.object({
  DEFAULT_SETTINGS: z.record(z.string(), z.unknown()),
  DEFAULT_WALLPAPER_FILTERS: WallpaperFiltersSchema,
  DEFAULT_WALLPAPER_SHADOW: WallpaperShadowSchema,
});

const parsed = SettingsDefaultsDataSchema.parse(data);

export const DEFAULT_WALLPAPER_FILTERS = parsed.DEFAULT_WALLPAPER_FILTERS as WallpaperDisplayFilters;
export const DEFAULT_WALLPAPER_SHADOW = parsed.DEFAULT_WALLPAPER_SHADOW as WallpaperShadow;
export const DEFAULT_SETTINGS = {
  ...parsed.DEFAULT_SETTINGS,
  streamDefaultQuality: DEFAULT_STREAM_QUALITY,
  tagTolerances: { ...DEFAULT_TAG_TOLERANCES },
} as SettingsDefaults;