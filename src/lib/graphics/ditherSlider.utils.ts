import { DITHER_SLIDER_DEFS } from "@/config/graphics/dither.config";
import type { DitherEffectOptions, DitherSliderField } from "@/types/graphics/dither";

export type DitherSliderDef = (typeof DITHER_SLIDER_DEFS)[number];

const SLIDER_BY_FIELD = DITHER_SLIDER_DEFS.reduce<
  Partial<Record<DitherSliderField, DitherSliderDef>>
>((acc, def) => {
  acc[def.field] = def;
  return acc;
}, {});

export const ditherSliderDef = (field: DitherSliderField): DitherSliderDef | undefined => {
  return SLIDER_BY_FIELD[field];
};

const SLIDER_ACTIVE: Partial<Record<DitherSliderField, (options: DitherEffectOptions) => boolean>> = {
  paletteMix: (options) => options.mode === "ordered" && options.palette.length > 0,
  levels: (options) => options.mode === "ordered" || options.palette.length === 0,
  dotSize: (options) => options.halftone > 0,
  dotSoftness: (options) => options.halftone > 0,
  glyphSize: (options) => options.glyphs > 0,
};

export const isSliderActive = (field: DitherSliderField, options: DitherEffectOptions): boolean => {
  return SLIDER_ACTIVE[field]?.(options) ?? true;
};
