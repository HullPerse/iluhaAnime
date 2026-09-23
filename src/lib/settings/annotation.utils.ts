import {
  ANNOTATION_BLUR_SIGMA_FACTOR,
  ANNOTATION_HISTORY_LIMIT,
  ANNOTATION_POINT_SPACING,
} from "@/config/settings/screenshot.config";
import type { AnnotationHistory, AnnotationItem, CropPoint, TextItem } from "@/types/screenshot";

let sequence = 0;

export function nextAnnotationId(): string {
  sequence += 1;
  return `mark-${sequence}`;
}

export function createHistory(): AnnotationHistory {
  return { past: [], present: [], future: [] };
}

export function commit(history: AnnotationHistory, present: AnnotationItem[]): AnnotationHistory {
  if (present === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-ANNOTATION_HISTORY_LIMIT),
    present,
    future: [],
  };
}

export function undo(history: AnnotationHistory): AnnotationHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: AnnotationHistory): AnnotationHistory {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

export function canUndo(history: AnnotationHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: AnnotationHistory): boolean {
  return history.future.length > 0;
}

export function appendPoint(
  points: CropPoint[],
  point: CropPoint,
  spacing = ANNOTATION_POINT_SPACING
): CropPoint[] {
  const last = points.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < spacing) return points;
  return [...points, point];
}

export function isBlurItem(item: AnnotationItem): boolean {
  return item.kind === "stroke" && item.tool === "blur";
}

export function isInkItem(item: AnnotationItem): boolean {
  return item.kind === "text" || item.tool !== "blur";
}

export function hasInk(items: AnnotationItem[]): boolean {
  return items.some(isInkItem);
}

export function hasBlur(items: AnnotationItem[]): boolean {
  return items.some(isBlurItem);
}

export function blurSigmaFor(size: number): number {
  return Math.max(0.5, size * ANNOTATION_BLUR_SIGMA_FACTOR);
}

export function withDraft(items: AnnotationItem[], draft: AnnotationItem | null): AnnotationItem[] {
  if (!draft) return items;
  if (!items.some((item) => item.id === draft.id)) return [...items, draft];
  return items.map((item) => (item.id === draft.id ? draft : item));
}

export function textBounds(
  item: TextItem,
  padding = 0
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return {
    left: item.point.x - padding,
    top: item.point.y - padding,
    right: item.point.x + item.width + padding,
    bottom: item.point.y + item.height + padding,
  };
}

export function hitTestText(
  items: AnnotationItem[],
  point: CropPoint,
  padding = 3
): TextItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== "text") continue;
    const bounds = textBounds(item, padding);
    if (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    ) {
      return item;
    }
  }
  return null;
}

export function moveText(item: TextItem, point: CropPoint): TextItem {
  return { ...item, point };
}

export function replaceText(
  item: TextItem,
  text: string,
  size: { width: number; height: number }
): TextItem {
  return { ...item, text, width: size.width, height: size.height };
}
