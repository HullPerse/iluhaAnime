import type { Ref } from "react";

export type DitherRGB = [number, number, number];

export interface DitherEffectOptions {
  levels: number;
  ditherStrength: number;
  ditherAmount: number;
  ditherMatrix: "bayer4" | "blue64";
  grain: number;
  texture: number;
  halftone: number;
  grayGrain: boolean;
  halftoneSize: number;
  halftoneSoftness: number;
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

export type DitherPalettePresetId = "default" | "red" | "gameboy" | "pico8" | "gray";

export interface DitherPalettePreset {
  id: DitherPalettePresetId;
  colors: DitherRGB[];
}

export type DitherPresetId = "empty" | "default" | "deep" | "soft" | "natural" | "capy" | "crt";

export interface DitherPreset {
  id: DitherPresetId;
  options: DitherEffectOptions;
}

export type DitherSliderField = Exclude<
  keyof DitherEffectOptions,
  "palette" | "ditherMatrix" | "grayGrain"
>;

export interface DitherRenderContext {
  source: Uint8ClampedArray<ArrayBuffer>;
  output: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  options: DitherEffectOptions;
  step: number;
  invStep: number;
  orderedSteps: [number, number, number];
  inkTarget: DitherRGB;
  usePalette: boolean;
  keepBlack: number;
  curveAmount: number;
  crushBase: number;
  squeezeBase: number;
  localBoost: number;
  inkDensity: number;
  shift: number;
  hasWarp: boolean;
  hasNoise: boolean;
  hasVignette: boolean;
  vignetteX: Float32Array | null;
  vignetteY: Float32Array | null;
}
