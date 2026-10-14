import type { Ref } from "react";

/** A single color in 8-bit sRGB. */
export type DitherRGB = [number, number, number];

/** How the image is reduced to few tones. */
export type DitherMode = "ordered" | "floyd" | "atkinson";

/** Ordered threshold map used by the `ordered` mode. */
export type DitherMatrix = "bayer4" | "bayer8" | "blue64";

/**
 * The full description of a dither look.
 *
 * Every field here earns its place: it either drives the dither/quantization
 * core or is a distinct, visible post-process. Redundant knobs from the old
 * engine (grain vs texture vs noise, strength vs amount, paper vs ink) were
 * collapsed into a single control per intent.
 */
export interface DitherEffectOptions {
  /** Dither engine: ordered threshold map or error diffusion. */
  mode: DitherMode;
  /** Threshold map for {@link DitherMode} = "ordered". */
  matrix: DitherMatrix;
  /** Dither amplitude, 0..2. 0 = plain posterize, 1 = standard, 2 = aggressive. */
  strength: number;
  /** Tone count when quantizing without a palette, 2..16. */
  levels: number;

  /** Target colors. Empty means an automatic grayscale/RGB ramp. */
  palette: DitherRGB[];
  /** How strongly to snap colors to {@link palette}, 0..1. */
  paletteMix: number;
  /** Collapse the image to luminance before dithering. */
  monochrome: boolean;

  /** Contrast S-curve, -1..1. 0 = unchanged. */
  contrast: number;
  /** Fine film grain, 0..1. */
  grain: number;

  /** Halftone dot screen amount, 0..1. */
  halftone: number;
  /** Halftone cell size in pixels, 2..12. */
  dotSize: number;
  /** Halftone dot edge softness, 0..1. */
  dotSoftness: number;
  /** Glyph (ASCII-art) overlay amount, 0..1. */
  glyphs: number;
  /** Glyph cell size in pixels, 6..20. */
  glyphSize: number;

  /** CRT scanline darkening, 0..1. */
  scanlines: number;
  /** Chromatic aberration (RGB split), 0..1. */
  chromatic: number;
  /** Barrel distortion of the frame, 0..0.5. */
  barrel: number;
  /** Edge vignette, 0..1. */
  vignette: number;
}

export interface DitherCanvasProps extends Partial<DitherEffectOptions> {
  src: string;
  className?: string;
  ariaLabel?: string;
  capToDisplay?: boolean;
  maxLongSide?: number;
  onError?: (message: string) => void;
  onReady?: () => void;
  onProgress?: (doneRows: number, totalRows: number) => void;
  ref?: Ref<HTMLCanvasElement>;
  scale?: number;
}

export interface DitherCacheEntry {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface DitherWorkerRequest {
  type: "render";
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  options: DitherEffectOptions;
}

export interface DitherWorkerResponse {
  type: "result";
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
}

export interface DitherWorkerProgress {
  type: "progress";
  id: number;
  done: number;
  total: number;
}

export type DitherPalettePresetId =
  | "original"
  | "mono"
  | "gameboy"
  | "pico8"
  | "gray"
  | "amber"
  | "ink"
  | "vapor";

export interface DitherPalettePreset {
  id: DitherPalettePresetId;
  colors: DitherRGB[];
}

export type DitherPresetId =
  | "none"
  | "natural"
  | "classic"
  | "gameboy"
  | "duotone"
  | "print"
  | "crt"
  | "glyphs"
  | "photo";

export interface DitherPreset {
  id: DitherPresetId;
  options: DitherEffectOptions;
}

export type DitherSliderField = Exclude<
  keyof DitherEffectOptions,
  "palette" | "matrix" | "mode" | "monochrome"
>;

export type DitherStatus = "loading" | "ready" | "error";
