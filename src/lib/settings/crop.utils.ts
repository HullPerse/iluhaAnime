import {
  CROP_MIN_SIZE,
  CROP_SNAP_DISPLAY_PX,
  CROP_ZOOM_FIT,
  CROP_ZOOM_MAX,
  CROP_ZOOM_MIN,
  CROP_ZOOM_PRECISION,
} from "@/config/settings/screenshot.config";
import type {
  CropBounds,
  CropFrame,
  CropGuide,
  CropHandle,
  CropPan,
  CropPoint,
  CropRect,
  CropSnap,
  CropView,
} from "@/types/screenshot";

export const NO_PAN: CropPan = { x: 0, y: 0 };

interface AxisSnap {
  delta: number;
  guide: number | null;
}

export interface CropResizeOptions {
  minSize?: number;
  ratio?: number | null;
  snapThreshold?: number;
}

export interface CropStartOptions {
  snapThreshold?: number;
  square?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function movingWest(handle: CropHandle): boolean {
  return handle.includes("w");
}

function movingNorth(handle: CropHandle): boolean {
  return handle.includes("n");
}

function movingEast(handle: CropHandle): boolean {
  return handle.includes("e");
}

function movingSouth(handle: CropHandle): boolean {
  return handle.includes("s");
}

function nearestSnap(values: number[], targets: number[], threshold: number): AxisSnap {
  let best: { distance: number; delta: number; guide: number } | null = null;
  for (const value of values) {
    for (const target of targets) {
      const distance = Math.abs(value - target);
      if (distance > threshold) continue;
      if (!best || distance < best.distance) {
        best = { distance, delta: target - value, guide: target };
      }
    }
  }
  return best ? { delta: best.delta, guide: best.guide } : { delta: 0, guide: null };
}

function snapEdge(
  edge: number,
  targets: number[],
  threshold: number,
  axis: "x" | "y",
  guides: CropGuide[]
): number {
  const snap = nearestSnap([edge], targets, threshold);
  if (snap.guide !== null) guides.push({ axis, value: snap.guide });
  return edge + snap.delta;
}

function snapMove(
  rect: CropRect,
  bounds: CropBounds,
  threshold: number,
  xTargets: number[],
  yTargets: number[]
): CropSnap {
  const guides: CropGuide[] = [];
  const horizontal = nearestSnap(
    [rect.x, rect.x + rect.width / 2, rect.x + rect.width],
    xTargets,
    threshold
  );
  const vertical = nearestSnap(
    [rect.y, rect.y + rect.height / 2, rect.y + rect.height],
    yTargets,
    threshold
  );
  if (horizontal.guide !== null) guides.push({ axis: "x", value: horizontal.guide });
  if (vertical.guide !== null) guides.push({ axis: "y", value: vertical.guide });
  return {
    rect: clampCrop({ ...rect, x: rect.x + horizontal.delta, y: rect.y + vertical.delta }, bounds),
    guides,
  };
}

function anchoredSize(
  rect: CropRect,
  handle: CropHandle,
  width: number,
  height: number,
  bounds: CropBounds
): CropRect {
  return clampCrop(
    {
      x: movingWest(handle) ? rect.x + rect.width - width : rect.x,
      y: movingNorth(handle) ? rect.y + rect.height - height : rect.y,
      width,
      height,
    },
    bounds
  );
}

export function fullCrop(bounds: CropBounds): CropRect {
  return { x: 0, y: 0, width: bounds.width, height: bounds.height };
}

export function clampCrop(rect: CropRect, bounds: CropBounds, minSize = CROP_MIN_SIZE): CropRect {
  const width = clamp(Math.round(rect.width), Math.min(minSize, bounds.width), bounds.width);
  const height = clamp(Math.round(rect.height), Math.min(minSize, bounds.height), bounds.height);
  const x = clamp(Math.round(rect.x), 0, Math.max(0, bounds.width - width));
  const y = clamp(Math.round(rect.y), 0, Math.max(0, bounds.height - height));
  return { x, y, width, height };
}

export function snapRect(
  rect: CropRect,
  handle: CropHandle,
  bounds: CropBounds,
  threshold: number
): CropSnap {
  if (threshold <= 0) return { rect, guides: [] };
  const xTargets = [0, bounds.width / 2, bounds.width];
  const yTargets = [0, bounds.height / 2, bounds.height];
  if (handle === "move") return snapMove(rect, bounds, threshold, xTargets, yTargets);

  const guides: CropGuide[] = [];
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (movingWest(handle)) left = snapEdge(left, xTargets, threshold, "x", guides);
  if (movingEast(handle)) right = snapEdge(right, xTargets, threshold, "x", guides);
  if (movingNorth(handle)) top = snapEdge(top, yTargets, threshold, "y", guides);
  if (movingSouth(handle)) bottom = snapEdge(bottom, yTargets, threshold, "y", guides);
  const snapped = clampCrop({ x: left, y: top, width: right - left, height: bottom - top }, bounds);
  const horizontalOnly =
    (movingEast(handle) || movingWest(handle)) && !movingNorth(handle) && !movingSouth(handle);
  const verticalOnly =
    (movingNorth(handle) || movingSouth(handle)) && !movingEast(handle) && !movingWest(handle);
  if (horizontalOnly && Math.abs(snapped.width - snapped.height) <= threshold) {
    return { rect: anchoredSize(snapped, handle, snapped.height, snapped.height, bounds), guides };
  }
  if (verticalOnly && Math.abs(snapped.width - snapped.height) <= threshold) {
    return { rect: anchoredSize(snapped, handle, snapped.width, snapped.width, bounds), guides };
  }
  return { rect: snapped, guides };
}

export function moveCrop(
  rect: CropRect,
  dx: number,
  dy: number,
  bounds: CropBounds,
  snapThreshold = 0
): CropSnap {
  return snapRect(
    clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, bounds),
    "move",
    bounds,
    snapThreshold
  );
}

export function resizeCrop(
  rect: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: CropBounds,
  options: CropResizeOptions = {}
): CropSnap {
  if (handle === "move") return moveCrop(rect, dx, dy, bounds, options.snapThreshold ?? 0);
  const minSize = options.minSize ?? CROP_MIN_SIZE;
  const west = movingWest(handle);
  const east = movingEast(handle);
  const north = movingNorth(handle);
  const south = movingSouth(handle);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (west) left = clamp(left + dx, 0, right - Math.min(minSize, bounds.width));
  if (east) right = clamp(right + dx, left + Math.min(minSize, bounds.width), bounds.width);
  if (north) top = clamp(top + dy, 0, bottom - Math.min(minSize, bounds.height));
  if (south) bottom = clamp(bottom + dy, top + Math.min(minSize, bounds.height), bounds.height);

  let next = clampCrop(
    { x: left, y: top, width: right - left, height: bottom - top },
    bounds,
    minSize
  );
  const ratio = options.ratio ?? null;
  const corner = (west || east) && (north || south);
  if (ratio !== null && ratio > 0 && corner) {
    next = anchoredSize(
      next,
      handle,
      next.width,
      Math.max(1, Math.round(next.width / ratio)),
      bounds
    );
  }
  return snapRect(next, handle, bounds, options.snapThreshold ?? 0);
}

export function startCrop(
  anchor: CropPoint,
  pointer: CropPoint,
  bounds: CropBounds,
  options: CropStartOptions = {}
): CropSnap {
  const threshold = options.snapThreshold ?? 0;
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  if (options.square) {
    const limit = Math.min(bounds.width, bounds.height);
    const side = clamp(Math.max(Math.abs(dx), Math.abs(dy)), 0, limit);
    return {
      rect: clampCrop(
        {
          x: clamp(dx < 0 ? anchor.x - side : anchor.x, 0, bounds.width - side),
          y: clamp(dy < 0 ? anchor.y - side : anchor.y, 0, bounds.height - side),
          width: side,
          height: side,
        },
        bounds,
        1
      ),
      guides: [],
    };
  }
  const guides: CropGuide[] = [];
  const x = clamp(pointer.x, 0, bounds.width);
  const y = clamp(pointer.y, 0, bounds.height);
  const movedX =
    threshold > 0 ? snapEdge(x, [0, bounds.width / 2, bounds.width], threshold, "x", guides) : x;
  const movedY =
    threshold > 0 ? snapEdge(y, [0, bounds.height / 2, bounds.height], threshold, "y", guides) : y;
  return {
    rect: clampCrop(
      {
        x: Math.min(anchor.x, movedX),
        y: Math.min(anchor.y, movedY),
        width: Math.abs(movedX - anchor.x),
        height: Math.abs(movedY - anchor.y),
      },
      bounds,
      1
    ),
    guides,
  };
}

export function snapThresholdForScale(scale: number): number {
  return CROP_SNAP_DISPLAY_PX / (scale > 0 ? scale : 1);
}

export function fitView(
  bounds: CropBounds,
  container: CropBounds,
  zoom: number = CROP_ZOOM_FIT,
  pan: CropPan = NO_PAN
): CropView {
  const safeZoom = clamp(zoom, CROP_ZOOM_MIN, CROP_ZOOM_MAX);
  const measured = container.width > 0 && container.height > 0;
  const fit = measured
    ? Math.min(container.width / bounds.width, container.height / bounds.height)
    : 1;
  const scale = fit * safeZoom;
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  if (!measured) {
    return { scale, left: pan.x, top: pan.y, width, height };
  }
  return {
    scale,
    left: container.width / 2 + pan.x - width / 2,
    top: container.height / 2 + pan.y - height / 2,
    width,
    height,
  };
}

export function clampPan(
  bounds: CropBounds,
  container: CropBounds,
  zoom: number,
  pan: CropPan
): CropPan {
  const view = fitView(bounds, container, zoom);
  const maxX = Math.max(0, (view.width - container.width) / 2);
  const maxY = Math.max(0, (view.height - container.height) / 2);
  return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
}

export function isInsidePicture(point: CropPoint, bounds: CropBounds): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= bounds.width && point.y <= bounds.height;
}

export function zoomAtPoint(
  bounds: CropBounds,
  container: CropBounds,
  zoom: number,
  pan: CropPan,
  factor: number,
  point: CropPoint
): { zoom: number; pan: CropPan } {
  const target = clamp(zoom * factor, CROP_ZOOM_MIN, CROP_ZOOM_MAX);
  const next = Math.round(target * CROP_ZOOM_PRECISION) / CROP_ZOOM_PRECISION;
  if (next <= CROP_ZOOM_FIT) return { zoom: next, pan: NO_PAN };
  if (next === zoom) return { zoom, pan };
  const before = fitView(bounds, container, zoom, pan);
  const source = {
    x: (point.x - before.left) / before.scale,
    y: (point.y - before.top) / before.scale,
  };
  const after = fitView(bounds, container, next);
  const panX = point.x - source.x * after.scale + after.width / 2 - container.width / 2;
  const panY = point.y - source.y * after.scale + after.height / 2 - container.height / 2;
  return { zoom: next, pan: clampPan(bounds, container, next, { x: panX, y: panY }) };
}

export function toFrame(rect: CropRect, scale: number): CropFrame {
  return {
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function fromFrame(frame: CropFrame, scale: number): CropRect {
  const safe = scale > 0 ? scale : 1;
  return {
    x: Math.round(frame.left / safe),
    y: Math.round(frame.top / safe),
    width: Math.round(frame.width / safe),
    height: Math.round(frame.height / safe),
  };
}

export function isSquare(rect: CropRect): boolean {
  return rect.width > 0 && rect.width === rect.height;
}

export function isFullCrop(rect: CropRect, bounds: CropBounds): boolean {
  return rect.x <= 0 && rect.y <= 0 && rect.width >= bounds.width && rect.height >= bounds.height;
}
