import * as z from "zod/mini";

import type { TranslationKey } from "@/types/core/i18n";
import type {
  DitherEffectOptions,
  DitherMatrix,
  DitherMode,
  DitherPalettePreset,
  DitherPalettePresetId,
  DitherPreset,
  DitherPresetId,
  DitherRGB,
  DitherSliderDef,
  DitherSliderField,
  DitherSliderGroup,
} from "@/types/graphics/dither";
import data from "./dither.data.json";

const DitherDataSchema = z.object({
  DITHER_BAKE_MAX_SIDE: z.number(),
  DITHER_BAKE_TIMEOUT_MS: z.number(),
  DITHER_BAND_ROWS: z.number(),
  DITHER_BARREL_STRENGTH: z.number(),
  DITHER_BAYER_4: z.array(z.number()),
  DITHER_BAYER_8: z.array(z.number()),
  DITHER_BAYER8_RANGE: z.number(),
  DITHER_BAYER8_SIZE: z.number(),
  DITHER_BAYER_RANGE: z.number(),
  DITHER_BAYER_SIZE: z.number(),
  DITHER_CHANNEL_SHIFT: z.array(z.array(z.number())),
  DITHER_CHROMATIC_SHIFT: z.number(),
  DITHER_DECODE_CACHE_CAPACITY: z.number(),
  DITHER_DEFAULTS: z.unknown(),
  DITHER_GLYPH_ALPHA: z.number(),
  DITHER_GLYPH_HEIGHT: z.number(),
  DITHER_GLYPH_PAD: z.number(),
  DITHER_GLYPH_RAMP: z.array(z.string()),
  DITHER_GLYPH_WIDTH: z.number(),
  DITHER_GRAIN_FREQUENCY: z.number(),
  DITHER_LUMINANCE_BLUE: z.number(),
  DITHER_LUMINANCE_GREEN: z.number(),
  DITHER_LUMINANCE_RED: z.number(),
  DITHER_MATRIX_LABELS: z.record(z.string(), z.string()),
  DITHER_MODE_LABELS: z.record(z.string(), z.string()),
  DITHER_NOISE_GAIN: z.number(),
  DITHER_NOISE_X: z.number(),
  DITHER_NOISE_Y: z.number(),
  DITHER_PALETTE_PRESET_LABELS: z.record(z.string(), z.string()),
  DITHER_PALETTE_PRESETS: z.unknown(),
  DITHER_PER_PAGE: z.number(),
  DITHER_PLACEHOLDER_ID: z.string(),
  DITHER_PLACEHOLDER_SRC: z.string(),
  DITHER_PRESET_LABELS: z.record(z.string(), z.string()),
  DITHER_PRESETS: z.unknown(),
  DITHER_RENDER_CACHE_CAPACITY: z.number(),
  DITHER_SCANLINE_DEPTH: z.number(),
  DITHER_SLIDER_DEFS: z.unknown(),
  DITHER_SLIDER_GROUPS: z.unknown(),
  DITHER_SLIDER_LABELS: z.record(z.string(), z.string()),
  DITHER_VIGNETTE_DEPTH: z.number(),
});

const parsed = DitherDataSchema.parse(data);

export const DITHER_BAYER_4 = parsed.DITHER_BAYER_4 as readonly number[];
export const DITHER_BAYER_SIZE = parsed.DITHER_BAYER_SIZE;
export const DITHER_BAYER_RANGE = parsed.DITHER_BAYER_RANGE;
export const DITHER_BAYER_8 = parsed.DITHER_BAYER_8 as readonly number[];
export const DITHER_BAYER8_SIZE = parsed.DITHER_BAYER8_SIZE;
export const DITHER_BAYER8_RANGE = parsed.DITHER_BAYER8_RANGE;
export const DITHER_PALETTE_PRESETS = parsed.DITHER_PALETTE_PRESETS as DitherPalettePreset[];
export const DITHER_DEFAULTS = parsed.DITHER_DEFAULTS as {
  barrel: number;
  chromatic: number;
  contrast: number;
  dotSize: number;
  dotSoftness: number;
  glyphs: number;
  glyphSize: number;
  grain: number;
  halftone: number;
  levels: number;
  matrix: DitherMatrix;
  mode: DitherMode;
  monochrome: boolean;
  palette: DitherRGB[];
  paletteMix: number;
  scale: number;
  scanlines: number;
  strength: number;
  vignette: number;
};
export const DITHER_NOISE_X = parsed.DITHER_NOISE_X;
export const DITHER_NOISE_Y = parsed.DITHER_NOISE_Y;
export const DITHER_NOISE_GAIN = parsed.DITHER_NOISE_GAIN;
export const DITHER_LUMINANCE_RED = parsed.DITHER_LUMINANCE_RED;
export const DITHER_LUMINANCE_GREEN = parsed.DITHER_LUMINANCE_GREEN;
export const DITHER_LUMINANCE_BLUE = parsed.DITHER_LUMINANCE_BLUE;
export const DITHER_GRAIN_FREQUENCY = parsed.DITHER_GRAIN_FREQUENCY;
export const DITHER_SCANLINE_DEPTH = parsed.DITHER_SCANLINE_DEPTH;
export const DITHER_CHROMATIC_SHIFT = parsed.DITHER_CHROMATIC_SHIFT;
export const DITHER_BARREL_STRENGTH = parsed.DITHER_BARREL_STRENGTH;
export const DITHER_VIGNETTE_DEPTH = parsed.DITHER_VIGNETTE_DEPTH;
export const DITHER_CHANNEL_SHIFT = parsed.DITHER_CHANNEL_SHIFT as unknown as readonly (readonly [
  number,
  number,
])[];
export const DITHER_GLYPH_RAMP = parsed.DITHER_GLYPH_RAMP as readonly string[];
export const DITHER_GLYPH_WIDTH = parsed.DITHER_GLYPH_WIDTH;
export const DITHER_GLYPH_HEIGHT = parsed.DITHER_GLYPH_HEIGHT;
export const DITHER_GLYPH_PAD = parsed.DITHER_GLYPH_PAD;
export const DITHER_GLYPH_ALPHA = parsed.DITHER_GLYPH_ALPHA;
export const DITHER_RENDER_CACHE_CAPACITY = parsed.DITHER_RENDER_CACHE_CAPACITY;
export const DITHER_DECODE_CACHE_CAPACITY = parsed.DITHER_DECODE_CACHE_CAPACITY;
export const DITHER_BAKE_MAX_SIDE = parsed.DITHER_BAKE_MAX_SIDE;
export const DITHER_BAND_ROWS = parsed.DITHER_BAND_ROWS;
export const DITHER_PER_PAGE = parsed.DITHER_PER_PAGE;
export const DITHER_PLACEHOLDER_ID = parsed.DITHER_PLACEHOLDER_ID;
export const DITHER_PLACEHOLDER_SRC = parsed.DITHER_PLACEHOLDER_SRC;
export const DITHER_PRESETS = parsed.DITHER_PRESETS as readonly DitherPreset[];
export const DITHER_SLIDER_DEFS = parsed.DITHER_SLIDER_DEFS as readonly DitherSliderDef[];
export const DITHER_SLIDER_GROUPS = parsed.DITHER_SLIDER_GROUPS as readonly DitherSliderGroup[];
export const DITHER_PRESET_LABELS = parsed.DITHER_PRESET_LABELS as Record<
  DitherPresetId,
  TranslationKey
>;
export const DITHER_MODE_LABELS = parsed.DITHER_MODE_LABELS as Record<DitherMode, TranslationKey>;
export const DITHER_MATRIX_LABELS = parsed.DITHER_MATRIX_LABELS as Record<
  DitherMatrix,
  TranslationKey
>;
export const DITHER_PALETTE_PRESET_LABELS = parsed.DITHER_PALETTE_PRESET_LABELS as Record<
  DitherPalettePresetId,
  TranslationKey
>;
export const DITHER_SLIDER_LABELS = parsed.DITHER_SLIDER_LABELS as Record<
  DitherSliderField,
  TranslationKey
>;
export const DITHER_BAKE_TIMEOUT_MS = parsed.DITHER_BAKE_TIMEOUT_MS;

export function resolveDitherPreset(id: DitherPresetId): DitherEffectOptions {
  const found = DITHER_PRESETS.find((preset) => preset.id === id);
  return (found?.options ?? DITHER_PRESETS[0]?.options) as DitherEffectOptions;
}
