import type { Ref } from "react";

export type DitherRGB = [number, number, number];

export type DitherCrossOrigin = "" | "anonymous" | "use-credentials";
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
  crossOrigin?: DitherCrossOrigin;
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
