export type ScreenshotFormat = "png" | "jpeg";

export interface ScreenshotCapture {
  path: string;
  width: number;
  height: number;
  defaultDir: string;
}

export interface SavedScreenshot {
  path: string;
  width: number;
  height: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropBounds {
  width: number;
  height: number;
}

export interface CropPoint {
  x: number;
  y: number;
}

export interface CropFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

export interface CropGuide {
  axis: "x" | "y";
  value: number;
}

export interface CropSnap {
  rect: CropRect;
  guides: CropGuide[];
}

export interface CropPan {
  x: number;
  y: number;
}

export interface CropView {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenshotScale {
  zoom: number;
  pan: CropPan;
}

export type ScreenshotTool = "select" | "pencil" | "eraser" | "text" | "blur";

export type InkTool = "pencil" | "eraser" | "blur";

export interface StrokeItem {
  id: string;
  kind: "stroke";
  tool: InkTool;
  color: string;
  size: number;
  points: CropPoint[];
}

export interface TextItem {
  id: string;
  kind: "text";
  color: string;
  size: number;
  point: CropPoint;
  text: string;
  width: number;
  height: number;
}

export type AnnotationItem = StrokeItem | TextItem;

export interface AnnotationHistory {
  past: AnnotationItem[][];
  present: AnnotationItem[];
  future: AnnotationItem[][];
}

export interface BlurLayerPayload {
  mask: string;
  sigma: number;
}

export interface ScreenshotLayersPayload {
  drawing?: string;
  blur?: BlurLayerPayload;
}
