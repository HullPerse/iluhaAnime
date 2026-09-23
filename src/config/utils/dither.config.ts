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

export const DITHER_BAYER_4: readonly number[] = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

export const DITHER_BAYER_SIZE = 4;

export const DITHER_BAYER_RANGE = 16;

export const DITHER_DEFAULT_PALETTE: DitherRGB[] = [
  [18, 18, 18],
  [54, 48, 43],
  [91, 67, 58],
  [135, 82, 65],
  [177, 111, 76],
  [207, 153, 99],
  [119, 139, 119],
  [75, 113, 119],
  [72, 91, 128],
  [111, 86, 126],
  [178, 108, 126],
  [231, 220, 194],
];

export const DITHER_RED_RAMP_PALETTE: DitherRGB[] = [
  [0, 0, 0],
  [17, 0, 0],
  [34, 0, 0],
  [51, 17, 17],
  [68, 17, 17],
  [85, 17, 17],
  [102, 17, 17],
  [119, 17, 17],
  [119, 34, 34],
  [153, 17, 17],
  [187, 102, 102],
  [238, 221, 221],
];

const DITHER_GAMEBOY_PALETTE: DitherRGB[] = [
  [15, 56, 15],
  [48, 98, 48],
  [139, 172, 15],
  [155, 188, 15],
];

const DITHER_GRAY_RAMP_PALETTE: DitherRGB[] = [
  [0, 0, 0],
  [36, 36, 36],
  [73, 73, 73],
  [109, 109, 109],
  [146, 146, 146],
  [182, 182, 182],
  [219, 219, 219],
  [255, 255, 255],
];

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

export const DITHER_VIOLET_RAMP_PALETTE: DitherRGB[] = [
  [6, 4, 10],
  [18, 12, 32],
  [36, 22, 62],
  [59, 38, 102],
  [91, 52, 184],
  [120, 74, 220],
  [139, 92, 246],
  [183, 157, 249],
];

export const DITHER_PALETTE_PRESETS: DitherPalettePreset[] = [
  { id: "default", colors: DITHER_DEFAULT_PALETTE },
  { id: "red", colors: DITHER_RED_RAMP_PALETTE },
  { id: "gameboy", colors: DITHER_GAMEBOY_PALETTE },
  { id: "pico8", colors: DITHER_PICO8_PALETTE },
  { id: "gray", colors: DITHER_GRAY_RAMP_PALETTE },
  { id: "violet", colors: DITHER_VIOLET_RAMP_PALETTE },
];

export const DITHER_DEFAULTS: {
  scale: number;
  levels: number;
  ditherStrength: number;
  ditherAmount: number;
  ditherMatrix: "bayer4" | "blue64";
  grain: number;
  texture: number;
  halftone: number;
  halftoneSize: number;
  halftoneSoftness: number;
  ascii: number;
  asciiSize: number;
  asciiFringe: number;
  grayGrain: boolean;
  monochromeNoise: number;
  ink: number;
  edgeDistortion: number;
  misregistration: number;
  barrel: number;
  chromaticRadius: number;
  wave: number;
  paper: number;
  vignette: number;
  paletteBias: number;
  shadowCrush: number;
  highlightCompression: number;
  contrastCurve: number;
  blackPoint: number;
  localContrast: number;
  inkDensity: number;
  palette: DitherRGB[];
} = {
  scale: 0.5,
  levels: 32,
  ditherStrength: 0.4,
  ditherAmount: 1,
  ditherMatrix: "bayer4",
  grain: 4,
  texture: 10,
  halftone: 0.1,
  halftoneSize: 0,
  halftoneSoftness: 0.25,
  ascii: 0,
  asciiSize: 12,
  asciiFringe: 0.7,
  grayGrain: true,
  monochromeNoise: 8,
  ink: 1,
  edgeDistortion: 0.5,
  misregistration: 0.35,
  barrel: 0,
  chromaticRadius: 0,
  wave: 0,
  paper: 5,
  vignette: 0.12,
  paletteBias: 0.65,
  shadowCrush: 0.4,
  highlightCompression: 0.75,
  contrastCurve: 0.3,
  blackPoint: 0.35,
  localContrast: 0,
  inkDensity: 0,
  palette: DITHER_RED_RAMP_PALETTE,
};

export const DITHER_NOISE_X = 12.9898;

export const DITHER_NOISE_Y = 78.233;

export const DITHER_NOISE_GAIN = 43758.5453;

export const DITHER_LUMINANCE_RED = 0.2126;

export const DITHER_LUMINANCE_GREEN = 0.7152;

export const DITHER_LUMINANCE_BLUE = 0.0722;

export const DITHER_EDGE_LATTICE = 12;

export const DITHER_EDGE_OFFSET = 100;
export const DITHER_MACRO_LATTICE = 20;

export const DITHER_TEXTURE_LATTICE = 24;
export const DITHER_RENDER_CACHE_CAPACITY = 30;
export const DITHER_DECODE_CACHE_CAPACITY = 3;
export const DITHER_BAKE_MAX_SIDE = 1920;
export const DITHER_BAND_ROWS = 64;

export const DITHER_LOCAL_TAP = 2;
export const DITHER_PER_PAGE = 3;

export const DITHER_PAPER_LATTICE = 30;
export const DITHER_PAPER_OFFSET = 200;

export const DITHER_GRAIN_FREQUENCY = 1.7;

export const DITHER_INK_FREQUENCY = 0.8;

export const DITHER_DOT_CELL = 2;

export const DITHER_WAVE_FREQUENCY = 0.03;

export const DITHER_CHANNEL_SHIFT: readonly (readonly [number, number])[] = [
  [0, 0],
  [37, 11],
  [11, 37],
];

const ROSETTE_X = Math.sqrt(3) / 2;
export const DITHER_ROSETTE_SHIFT = 0.25;
export const DITHER_ROSETTE_VECTORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-ROSETTE_X, 0.5],
  [ROSETTE_X, 0.5],
];

export const DITHER_ASCII_RAMP: readonly string[] = [
  " ",
  " ",
  " ",
  ".",
  ":",
  ">",
  "~",
  "×",
  "*",
  "#",
];

export const DITHER_ASCII_GLYPH_WIDTH = 5;
export const DITHER_ASCII_GLYPH_HEIGHT = 7;
export const DITHER_ASCII_PAD = 2;
export const DITHER_ASCII_LATTICE_X = 0.55;
export const DITHER_ASCII_LATTICE_Y = 0.35;
export const DITHER_ASCII_SWIRL = 2.1;
export const DITHER_ASCII_SWIRL_RATE = 0.9;
export const DITHER_ASCII_TILT = 1.7;
export const DITHER_ASCII_TILT_RATE = 0.6;
export const DITHER_ASCII_NOISE_BASE = 0.72;
export const DITHER_ASCII_NOISE_RANGE = 0.58;
export const DITHER_ASCII_ALPHA_BASE = 0.16;
export const DITHER_ASCII_ALPHA_RANGE = 0.5;

export const DITHER_MONO_FINE_SHARE = 0.65;

export const DITHER_PLACEHOLDER_ID = "placeholder";

export const DITHER_PLACEHOLDER_SRC = "/wallpaper_placeholder.jpg";

const DITHER_NEUTRAL_OPTIONS: DitherEffectOptions = {
  levels: 256,
  ditherStrength: 0,
  ditherAmount: 1,
  ditherMatrix: "bayer4",
  grain: 0,
  texture: 0,
  halftone: 0,
  halftoneSize: 0,
  halftoneSoftness: 0,
  ascii: 0,
  asciiSize: 12,
  asciiFringe: 0.7,
  grayGrain: true,
  monochromeNoise: 0,
  ink: 0,
  edgeDistortion: 0,
  misregistration: 0,
  barrel: 0,
  chromaticRadius: 0,
  wave: 0,
  paper: 0,
  vignette: 0,
  paletteBias: 0,
  shadowCrush: 0,
  highlightCompression: 0,
  contrastCurve: 0,
  blackPoint: 0,
  localContrast: 0,
  inkDensity: 0,
  palette: DITHER_DEFAULTS.palette,
};

const { ...DEFAULT_EFFECT_OPTIONS } = DITHER_DEFAULTS;
delete (DEFAULT_EFFECT_OPTIONS as { scale?: number }).scale;

export const DITHER_PRESETS: readonly DitherPreset[] = [
  { id: "empty", options: DITHER_NEUTRAL_OPTIONS },
  { id: "default", options: { ...DEFAULT_EFFECT_OPTIONS } },
  {
    id: "deep",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      blackPoint: 0.5,
      shadowCrush: 0.6,
      ink: 4,
      contrastCurve: 0.45,
      highlightCompression: 0.85,
    },
  },
  {
    id: "soft",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      ditherStrength: 0.2,
      grain: 6,
      monochromeNoise: 4,
      ink: 0,
      shadowCrush: 0.15,
      blackPoint: 0.2,
      paletteBias: 0.4,
    },
  },
  {
    id: "natural",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      levels: 40,
      ditherStrength: 0.4,
      ditherAmount: 1,
      ditherMatrix: "blue64",
      grain: 4,
      texture: 3,
      halftone: 0,
      monochromeNoise: 3,
      ink: 0,
      edgeDistortion: 0,
      misregistration: 0,
      paper: 3,
      vignette: 0,
      paletteBias: 0.35,
      shadowCrush: 0.1,
      highlightCompression: 0.3,
      contrastCurve: 0.15,
      blackPoint: 0.05,
      localContrast: 0.3,
      inkDensity: 0,
      palette: DITHER_DEFAULT_PALETTE,
    },
  },
  {
    id: "capy",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      levels: 24,

      ditherMatrix: "bayer4",
      ditherStrength: 0.7,
      ditherAmount: 1,

      grain: 0,
      texture: 0,
      halftone: 0,
      halftoneSize: 0,
      halftoneSoftness: 0,
      monochromeNoise: 0,

      ink: 0,
      edgeDistortion: 0,
      misregistration: 0,

      paper: 0,
      vignette: 0.35,

      paletteBias: 0,
      shadowCrush: 0.35,
      highlightCompression: 0,

      contrastCurve: 0.2,
      blackPoint: 0.25,
      localContrast: 0,
      inkDensity: 0,
    },
  },
  {
    id: "ascii",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      levels: 8,
      ditherStrength: 0.35,
      ditherAmount: 1,
      ditherMatrix: "blue64",
      grain: 0,
      texture: 0,
      halftone: 0,
      halftoneSize: 0,
      halftoneSoftness: 0,
      ascii: 0.75,
      asciiSize: 12,
      asciiFringe: 0.7,
      monochromeNoise: 6,
      ink: 0,
      edgeDistortion: 0,
      misregistration: 0,
      barrel: 0,
      chromaticRadius: 0,
      wave: 0,
      paper: 0,
      vignette: 0.35,
      paletteBias: 0.7,
      shadowCrush: 0.5,
      highlightCompression: 0.6,
      contrastCurve: 0.4,
      blackPoint: 0.45,
      localContrast: 0,
      inkDensity: 0.35,
      palette: DITHER_VIOLET_RAMP_PALETTE,
    },
  },
  {
    id: "crt",
    options: {
      ...DEFAULT_EFFECT_OPTIONS,
      levels: 32,
      ditherStrength: 0.5,
      ditherAmount: 1,
      ditherMatrix: "bayer4",
      grain: 3,
      texture: 4,
      halftone: 0,
      halftoneSize: 0,
      halftoneSoftness: 0,
      monochromeNoise: 3,
      ink: 1,
      edgeDistortion: 0,
      misregistration: 0.8,
      barrel: 0.25,
      chromaticRadius: 1.2,
      wave: 0,
      paper: 0,
      vignette: 0.3,
      paletteBias: 0.3,
      shadowCrush: 0.3,
      highlightCompression: 0.5,
      contrastCurve: 0.2,
      blackPoint: 0.2,
      localContrast: 0.2,
      inkDensity: 0,
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
  { field: "levels", min: 2, max: 64, step: 1 },
  { field: "ditherStrength", min: 0, max: 2, step: 0.05 },
  { field: "ditherAmount", min: 0, max: 1, step: 0.05 },
  { field: "grain", min: 0, max: 20, step: 0.5 },
  { field: "texture", min: 0, max: 30, step: 0.5 },
  { field: "halftone", min: 0, max: 1, step: 0.05 },
  { field: "halftoneSize", min: 0, max: 6, step: 0.5 },
  { field: "halftoneSoftness", min: 0, max: 1, step: 0.05 },
  { field: "ascii", min: 0, max: 1, step: 0.05 },
  { field: "asciiSize", min: 4, max: 24, step: 1 },
  { field: "asciiFringe", min: 0, max: 1, step: 0.05 },
  { field: "monochromeNoise", min: 0, max: 20, step: 0.5 },
  { field: "ink", min: 0, max: 20, step: 0.5 },
  { field: "edgeDistortion", min: 0, max: 3, step: 0.1 },
  { field: "misregistration", min: 0, max: 3, step: 0.1 },
  { field: "barrel", min: 0, max: 0.5, step: 0.05 },
  { field: "chromaticRadius", min: 0, max: 2, step: 0.1 },
  { field: "wave", min: 0, max: 12, step: 0.5 },
  { field: "paper", min: 0, max: 20, step: 0.5 },
  { field: "vignette", min: 0, max: 1, step: 0.05 },
  { field: "paletteBias", min: 0, max: 1, step: 0.05 },
  { field: "shadowCrush", min: 0, max: 1, step: 0.05 },
  { field: "highlightCompression", min: 0, max: 1, step: 0.05 },
  { field: "contrastCurve", min: 0, max: 1, step: 0.05 },
  { field: "blackPoint", min: 0, max: 1, step: 0.05 },
  { field: "localContrast", min: 0, max: 1, step: 0.05 },
  { field: "inkDensity", min: 0, max: 1, step: 0.05 },
];

export const DITHER_PRESET_LABELS: Record<DitherPresetId, TranslationKey> = {
  empty: "search.dither.preset.empty",
  default: "search.dither.preset.default",
  deep: "search.dither.preset.deep",
  soft: "search.dither.preset.soft",
  natural: "search.dither.preset.natural",
  capy: "search.dither.preset.capy",
  crt: "search.dither.preset.crt",
  ascii: "search.dither.preset.ascii",
};

export const DITHER_PALETTE_PRESET_LABELS: Record<DitherPalettePresetId, TranslationKey> = {
  default: "search.dither.palette.preset.default",
  red: "search.dither.palette.preset.red",
  gameboy: "search.dither.palette.preset.gameboy",
  pico8: "search.dither.palette.preset.pico8",
  gray: "search.dither.palette.preset.gray",
  violet: "search.dither.palette.preset.violet",
};

export const DITHER_SLIDER_LABELS: Record<DitherSliderField, TranslationKey> = {
  levels: "search.dither.opt.levels",
  ditherStrength: "search.dither.opt.ditherStrength",
  ditherAmount: "search.dither.opt.ditherAmount",
  grain: "search.dither.opt.grain",
  texture: "search.dither.opt.texture",
  halftone: "search.dither.opt.halftone",
  halftoneSize: "search.dither.opt.halftoneSize",
  halftoneSoftness: "search.dither.opt.halftoneSoftness",
  ascii: "search.dither.opt.ascii",
  asciiSize: "search.dither.opt.asciiSize",
  asciiFringe: "search.dither.opt.asciiFringe",
  monochromeNoise: "search.dither.opt.monochromeNoise",
  ink: "search.dither.opt.ink",
  edgeDistortion: "search.dither.opt.edgeDistortion",
  misregistration: "search.dither.opt.misregistration",
  barrel: "search.dither.opt.barrel",
  chromaticRadius: "search.dither.opt.chromaticRadius",
  wave: "search.dither.opt.wave",
  paper: "search.dither.opt.paper",
  vignette: "search.dither.opt.vignette",
  paletteBias: "search.dither.opt.paletteBias",
  shadowCrush: "search.dither.opt.shadowCrush",
  highlightCompression: "search.dither.opt.highlightCompression",
  contrastCurve: "search.dither.opt.contrastCurve",
  blackPoint: "search.dither.opt.blackPoint",
  localContrast: "search.dither.opt.localContrast",
  inkDensity: "search.dither.opt.inkDensity",
};

export const DITHER_BAKE_TIMEOUT_MS = 30_000;
