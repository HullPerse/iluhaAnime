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

export const isSliderActive = (field: DitherSliderField, options: DitherEffectOptions): boolean => {
  if (field === "paletteMix") return options.mode === "ordered" && options.palette.length > 0;
  if (field === "levels") return options.mode === "ordered" || options.palette.length === 0;
  if (field === "dotSize" || field === "dotSoftness") return options.halftone > 0;
  if (field === "glyphSize") return options.glyphs > 0;
  return true;
};
