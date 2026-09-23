import { ANNOTATION_TEXT_LINE_HEIGHT } from "@/config/settings/screenshot.config";
import { blurSigmaFor, isBlurItem } from "@/lib/settings/annotation.utils";
import type { AnnotationItem, CropPoint, StrokeItem, TextItem } from "@/types/screenshot";

export const INK_CANVAS_COLOR = "#000000";
export const BLUR_MASK_COLOR = "#ffffff";
const BLUR_DRAFT_COLOR = "rgba(120,120,120,0.45)";
const TEXT_WIDTH_FACTOR = 0.6;

export function fontFor(family: string, size: number): string {
  return `${size}px ${family}`;
}

function strokePoints(points: CropPoint[]): CropPoint[] {
  const first = points[0];
  if (!first) return points;
  return [first, first, ...points.slice(1)];
}

export function paintStroke(
  context: CanvasRenderingContext2D,
  points: CropPoint[],
  color: string,
  size: number,
  erase = false
): void {
  if (points.length === 0) return;
  context.save();
  context.globalCompositeOperation = erase ? "destination-out" : "source-over";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = size;
  context.lineCap = "round";
  context.lineJoin = "round";
  const path = strokePoints(points);
  context.beginPath();
  const [start, ...rest] = path;
  if (start) {
    context.moveTo(start.x, start.y);
    if (rest.length === 0) {
      context.lineTo(start.x, start.y);
    }
    for (const point of rest) context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

export function paintText(
  context: CanvasRenderingContext2D,
  item: TextItem,
  family: string,
  color = item.color
): void {
  if (item.text.length === 0) return;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.font = fontFor(family, item.size);
  context.textBaseline = "top";
  context.textAlign = "left";
  context.fillStyle = color;
  context.fillText(item.text, item.point.x, item.point.y);
  context.restore();
}

export function measureText(
  context: CanvasRenderingContext2D | null,
  family: string,
  size: number,
  text: string
): { width: number; height: number } {
  const height = size * ANNOTATION_TEXT_LINE_HEIGHT;
  if (!context || typeof context.measureText !== "function") {
    return { width: text.length * size * TEXT_WIDTH_FACTOR, height };
  }
  context.save();
  context.font = fontFor(family, size);
  const measured = context.measureText(text);
  context.restore();
  return { width: Math.max(size * 0.4, measured.width), height };
}

function paintOne(
  context: CanvasRenderingContext2D,
  item: AnnotationItem,
  family: string,
  draftId: string | null
): void {
  if (item.kind === "text") {
    paintText(context, item, family);
    return;
  }
  if (item.tool === "blur") {
    if (item.id === draftId) {
      paintStroke(context, item.points, BLUR_DRAFT_COLOR, item.size);
    }
    return;
  }
  paintStroke(
    context,
    item.points,
    item.tool === "eraser" ? INK_CANVAS_COLOR : item.color,
    item.size,
    item.tool === "eraser"
  );
}

export function paintAnnotations(
  context: CanvasRenderingContext2D | null,
  items: AnnotationItem[],
  family: string,
  draftId: string | null = null
): void {
  if (!context) return;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  for (const item of items) paintOne(context, item, family, draftId);
}

export function paintBlurMask(
  context: CanvasRenderingContext2D | null,
  items: AnnotationItem[]
): void {
  if (!context) return;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  for (const item of items) {
    if (isBlurItem(item)) {
      paintStroke(context, (item as StrokeItem).points, BLUR_MASK_COLOR, item.size);
      continue;
    }
    if (item.kind === "stroke" && item.tool === "eraser") {
      paintStroke(context, item.points, BLUR_MASK_COLOR, item.size, true);
    }
  }
}

export function blurPreviewSigma(items: AnnotationItem[]): number {
  const blur = items.find(isBlurItem);
  if (!blur || blur.kind !== "stroke") return 0;
  return blurSigmaFor(blur.size);
}
