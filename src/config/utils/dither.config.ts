import type {
  DitherEffectOptions,
  DitherPalettePreset,
  DitherPalettePresetId,
  DitherPreset,
  DitherPresetId,
  DitherRGB,
  DitherSliderField,
} from "@/types/dither";
import type { TranslationKey } from "@/types/i18n";

/** Ordered 4x4 Bayer threshold map. */
export const DITHER_BAYER_4: readonly number[] = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

export const DITHER_BAYER_SIZE = 4;
export const DITHER_BAYER_RANGE = 16;

/** Ordered 8x8 Bayer threshold map. */
export const DITHER_BAYER_8: readonly number[] = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46,
  6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27,
  49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

export const DITHER_BAYER8_SIZE = 8;
export const DITHER_BAYER8_RANGE = 64;

/** Neutral black & white. */
const DITHER_MONO_PALETTE: DitherRGB[] = [
  [0, 0, 0],
  [255, 255, 255],
];

/** Classic 4-tone Game Boy green. */
const DITHER_GAMEBOY_PALETTE: DitherRGB[] = [
  [15, 56, 15],
  [48, 98, 48],
  [139, 172, 15],
  [155, 188, 15],
];

/** PICO-8's 16-color hardware palette. */
const DITHER_PICO8_PALETTE: DitherRGB[] = [
  [0, 0, 0],
  [29, 43, 83],
  [126, 37, 83],
  [0, 135, 81],
  [171, 82, 54],
  [95, 87, 79],
  [194, 195, 199],
  [255, 241, 232],
  [255, 0, 77],
  [255, 163, 0],
  [255, 236, 39],
  [0, 228, 54],
  [41, 173, 255],
  [131, 118, 156],
  [255, 119, 168],
  [255, 204, 170],
];

/** Even 8-step gray ramp. */
const DITHER_GRAY_PALETTE: DitherRGB[] = [
  [0, 0, 0],
  [36, 36, 36],
  [73, 73, 73],
  [109, 109, 109],
  [146, 146, 146],
  [182, 182, 182],
  [219, 219, 219],
  [255, 255, 255],
];

/** Warm amber monochrome, straight off a CRT terminal. */
const DITHER_AMBER_PALETTE: DitherRGB[] = [
  [12, 8, 2],
  [56, 30, 4],
  [116, 66, 8],
  [176, 112, 16],
  [230, 176, 64],
  [255, 226, 150],
];

/** Cool ink-on-paper duotone. */
const DITHER_INK_PALETTE: DitherRGB[] = [
  [10, 14, 26],
  [34, 46, 72],
  [74, 92, 128],
  [130, 148, 178],
  [196, 206, 220],
  [247, 246, 242],
];

/** Neon violet/cyan synthwave ramp. */
const DITHER_VAPOR_PALETTE: DitherRGB[] = [
  [14, 6, 34],
  [48, 14, 80],
  [104, 28, 150],
  [178, 52, 176],
  [70, 210, 224],
  [198, 242, 255],
];

export const DITHER_PALETTE_PRESETS: DitherPalettePreset[] = [
  { id: "original", colors: [] },
  { id: "mono", colors: DITHER_MONO_PALETTE },
  { id: "gameboy", colors: DITHER_GAMEBOY_PALETTE },
  { id: "pico8", colors: DITHER_PICO8_PALETTE },
  { id: "gray", colors: DITHER_GRAY_PALETTE },
  { id: "amber", colors: DITHER_AMBER_PALETTE },
  { id: "ink", colors: DITHER_INK_PALETTE },
  { id: "vapor", colors: DITHER_VAPOR_PALETTE },
];

/**
 * The engine defaults. This is also the "natural" baseline: a soft blue-noise
 * dither in full color with a gentle tonal curve.
 */
export const DITHER_DEFAULTS: {
  scale: number;
  mode: DitherEffectOptions["mode"];
  matrix: DitherEffectOptions["matrix"];
  strength: number;
  levels: number;
  palette: DitherRGB[];
  paletteMix: number;
  monochrome: boolean;
  contrast: number;
  grain: number;
  halftone: number;
  dotSize: number;
  dotSoftness: number;
  glyphs: number;
  glyphSize: number;
  scanlines: number;
  chromatic: number;
  barrel: number;
  vignette: number;
} = {
  scale: 1,
  mode: "ordered",
  matrix: "blue64",
  strength: 0.6,
  levels: 10,
  palette: [],
  paletteMix: 1,
  monochrome: false,
  contrast: 0.05,
  grain: 0.02,
  halftone: 0,
  dotSize: 4,
  dotSoftness: 0.4,
  glyphs: 0,
  glyphSize: 10,
  scanlines: 0,
  chromatic: 0,
  barrel: 0,
  vignette: 0,
};

export const DITHER_NOISE_X = 12.9898;
export const DITHER_NOISE_Y = 78.233;
export const DITHER_NOISE_GAIN = 43758.5453;

export const DITHER_LUMINANCE_RED = 0.2126;
export const DITHER_LUMINANCE_GREEN = 0.7152;
export const DITHER_LUMINANCE_BLUE = 0.0722;

/** Fine grain lattice scale. */
export const DITHER_GRAIN_FREQUENCY = 1.7;
/** How dark a fully-on scanline row becomes (1 = black). */
export const DITHER_SCANLINE_DEPTH = 0.55;
/** Maximum RGB split, in pixels, at chromatic = 1. */
export const DITHER_CHROMATIC_SHIFT = 10;
/** Radial pull of the barrel warp at barrel = 1. */
export const DITHER_BARREL_STRENGTH = 0.5;
/** Smallest vignette multiplier at the corners. */
export const DITHER_VIGNETTE_DEPTH = 0.85;

/** Per-channel threshold offsets so color dither doesn't stack channels. */
export const DITHER_CHANNEL_SHIFT: readonly (readonly [number, number])[] = [
  [0, 0],
  [37, 11],
  [11, 37],
];

/** Density ramp for the glyph overlay, light to heavy. */
export const DITHER_GLYPH_RAMP: readonly string[] = [
  " ",
  " ",
  ".",
  ":",
  ">",
  "~",
  "×",
  "*",
  "#",
  "#",
];

export const DITHER_GLYPH_WIDTH = 5;
export const DITHER_GLYPH_HEIGHT = 7;
export const DITHER_GLYPH_PAD = 2;
export const DITHER_GLYPH_ALPHA = 0.85;

export const DITHER_RENDER_CACHE_CAPACITY = 30;
export const DITHER_DECODE_CACHE_CAPACITY = 3;
export const DITHER_BAKE_MAX_SIDE = 1920;
export const DITHER_BAND_ROWS = 64;

export const DITHER_PER_PAGE = 3;

export const DITHER_PLACEHOLDER_ID = "placeholder";
export const DITHER_PLACEHOLDER_SRC = "/wallpaper_placeholder.jpg";

/** Full bypass: the renderer becomes an identity transform. */
const DITHER_NEUTRAL_OPTIONS: DitherEffectOptions = {
  mode: "ordered",
  matrix: "bayer4",
  strength: 0,
  levels: 256,
  palette: [],
  paletteMix: 0,
  monochrome: false,
  contrast: 0,
  grain: 0,
  halftone: 0,
  dotSize: 4,
  dotSoftness: 0,
  glyphs: 0,
  glyphSize: 10,
  scanlines: 0,
  chromatic: 0,
  barrel: 0,
  vignette: 0,
};

const { scale: _scale, ...DEFAULT_EFFECT_OPTIONS } = DITHER_DEFAULTS;

export const DITHER_PRESETS: readonly DitherPreset[] = [
  { id: "none", options: DITHER_NEUTRAL_OPTIONS },
  { id: "natural", options: { ...DEFAULT_EFFECT_OPTIONS } },
  {
    id: "classic",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      matrix: "bayer8",
      strength: 1,
      levels: 4,
      monochrome: true,
      contrast: 0.1,
      grain: 0,
    },
  },
  {
    id: "gameboy",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      matrix: "bayer4",
      strength: 1,
      levels: 4,
      palette: DITHER_GAMEBOY_PALETTE,
      paletteMix: 1,
      monochrome: true,
      contrast: 0.1,
      grain: 0,
    },
  },
  {
    id: "duotone",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      matrix: "blue64",
      strength: 0.9,
      levels: 6,
      palette: DITHER_INK_PALETTE,
      paletteMix: 1,
      monochrome: true,
      contrast: 0.15,
      grain: 0,
    },
  },
  {
    id: "print",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      matrix: "bayer4",
      strength: 0.8,
      levels: 5,
      palette: [],
      paletteMix: 0,
      monochrome: true,
      contrast: 0.2,
      grain: 0.05,
      halftone: 1,
      dotSize: 5,
      dotSoftness: 0.25,
    },
  },
  {
    id: "crt",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      matrix: "bayer4",
      strength: 0.7,
      levels: 8,
      monochrome: false,
      contrast: 0.15,
      grain: 0.03,
      scanlines: 0.5,
      chromatic: 0.6,
      barrel: 0.3,
      vignette: 0.4,
    },
  },
  {
    id: "glyphs",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      matrix: "blue64",
      strength: 0.6,
      levels: 6,
      monochrome: true,
      contrast: 0.2,
      grain: 0,
      glyphs: 1,
      glyphSize: 10,
    },
  },
  {
    id: "photo",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      mode: "floyd",
      matrix: "bayer4",
      strength: 1,
      levels: 6,
      monochrome: false,
      contrast: 0.05,
      grain: 0.01,
    },
  },
];

export function resolveDitherPreset(id: DitherPresetId): DitherEffectOptions {
  const found = DITHER_PRESETS.find((preset) => preset.id === id);
  return found ? { ...found.options } : { ...DITHER_NEUTRAL_OPTIONS };
}

export interface DitherSliderDef {
  field: DitherSliderField;
  min: number;
  max: number;
  step: number;
}

export const DITHER_SLIDER_DEFS: readonly DitherSliderDef[] = [
  { field: "strength", min: 0, max: 2, step: 0.05 },
  { field: "levels", min: 2, max: 16, step: 1 },
  { field: "paletteMix", min: 0, max: 1, step: 0.05 },
  { field: "contrast", min: -1, max: 1, step: 0.05 },
  { field: "grain", min: 0, max: 1, step: 0.05 },
  { field: "halftone", min: 0, max: 1, step: 0.05 },
  { field: "dotSize", min: 2, max: 12, step: 1 },
  { field: "dotSoftness", min: 0, max: 1, step: 0.05 },
  { field: "glyphs", min: 0, max: 1, step: 0.05 },
  { field: "glyphSize", min: 6, max: 20, step: 1 },
  { field: "scanlines", min: 0, max: 1, step: 0.05 },
  { field: "chromatic", min: 0, max: 1, step: 0.05 },
  { field: "barrel", min: 0, max: 0.5, step: 0.05 },
  { field: "vignette", min: 0, max: 1, step: 0.05 },
];

export interface DitherSliderGroup {
  title: TranslationKey;
  fields: readonly DitherSliderField[];
}

export const DITHER_SLIDER_GROUPS: readonly DitherSliderGroup[] = [
  {
    title: "search.dither.group.pattern",
    fields: ["strength", "levels", "paletteMix"],
  },
  {
    title: "search.dither.group.tone",
    fields: ["contrast", "grain"],
  },
  {
    title: "search.dither.group.print",
    fields: ["halftone", "dotSize", "dotSoftness", "glyphs", "glyphSize"],
  },
  {
    title: "search.dither.group.display",
    fields: ["scanlines", "chromatic", "barrel", "vignette"],
  },
];

export const DITHER_PRESET_LABELS: Record<DitherPresetId, TranslationKey> = {
  none: "search.dither.preset.none",
  natural: "search.dither.preset.natural",
  classic: "search.dither.preset.classic",
  gameboy: "search.dither.preset.gameboy",
  duotone: "search.dither.preset.duotone",
  print: "search.dither.preset.print",
  crt: "search.dither.preset.crt",
  glyphs: "search.dither.preset.glyphs",
  photo: "search.dither.preset.photo",
};

export const DITHER_PALETTE_PRESET_LABELS: Record<DitherPalettePresetId, TranslationKey> = {
  original: "search.dither.palette.preset.original",
  mono: "search.dither.palette.preset.mono",
  gameboy: "search.dither.palette.preset.gameboy",
  pico8: "search.dither.palette.preset.pico8",
  gray: "search.dither.palette.preset.gray",
  amber: "search.dither.palette.preset.amber",
  ink: "search.dither.palette.preset.ink",
  vapor: "search.dither.palette.preset.vapor",
};

export const DITHER_SLIDER_LABELS: Record<DitherSliderField, TranslationKey> = {
  strength: "search.dither.opt.strength",
  levels: "search.dither.opt.levels",
  paletteMix: "search.dither.opt.paletteMix",
  contrast: "search.dither.opt.contrast",
  grain: "search.dither.opt.grain",
  halftone: "search.dither.opt.halftone",
  dotSize: "search.dither.opt.dotSize",
  dotSoftness: "search.dither.opt.dotSoftness",
  glyphs: "search.dither.opt.glyphs",
  glyphSize: "search.dither.opt.glyphSize",
  scanlines: "search.dither.opt.scanlines",
  chromatic: "search.dither.opt.chromatic",
  barrel: "search.dither.opt.barrel",
  vignette: "search.dither.opt.vignette",
};

export const DITHER_BAKE_TIMEOUT_MS = 30_000;
