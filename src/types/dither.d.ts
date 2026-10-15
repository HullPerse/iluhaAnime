import type { Ref } from "react";

export type DitherRGB = [number, number, number];

export type DitherMode = "ordered" | "floyd" | "atkinson";

export type DitherMatrix = "bayer4" | "bayer8" | "blue64";

export interface DitherEffectOptions {
  mode: DitherMode;
  matrix: DitherMatrix;
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
