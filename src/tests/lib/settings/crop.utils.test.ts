import { describe, expect, it } from "vitest";

import {
  clampCrop,
  clampPan,
  fitView,
  fromFrame,
  fullCrop,
  isFullCrop,
  isInsidePicture,
  isSquare,
  moveCrop,
  resizeCrop,
  snapRect,
  snapThresholdForScale,
  startCrop,
  toFrame,
  zoomAtPoint,
} from "@/lib/settings/crop.utils";

const bounds = { width: 100, height: 50 };

describe("fullCrop", () => {
  it("covers the whole image", () => {
    expect(fullCrop(bounds)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });
});

describe("clampCrop", () => {
  it("pulls a rect back inside the image", () => {
    expect(clampCrop({ x: 90, y: 40, width: 30, height: 30 }, bounds)).toEqual({
      x: 70,
      y: 20,
      width: 30,
      height: 30,
    });
  });

  it("refuses negative positions", () => {
    expect(clampCrop({ x: -20, y: -5, width: 40, height: 20 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 20,
    });
  });

  it("enforces the minimum size", () => {
    expect(clampCrop({ x: 0, y: 0, width: 2, height: 3 }, bounds, 8)).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 8,
    });
  });

  it("never grows past the image", () => {
    expect(clampCrop({ x: 0, y: 0, width: 500, height: 500 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
  });
});

describe("moveCrop", () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };

  it("moves freely inside the image", () => {
    expect(moveCrop(rect, 5, -4, bounds).rect).toEqual({ x: 15, y: 6, width: 20, height: 20 });
  });

  it("stops at the borders", () => {
    expect(moveCrop(rect, 100, 100, bounds).rect).toEqual({ x: 80, y: 30, width: 20, height: 20 });
    expect(moveCrop(rect, -100, -100, bounds).rect).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("sticks to the centre and reports the guide", () => {
    const near = { x: 41, y: 14, width: 20, height: 20 };
    const snapped = moveCrop(near, 0, 0, bounds, 3);
    expect(snapped.rect.x).toBe(40);
    expect(snapped.guides).toContainEqual({ axis: "x", value: 50 });
  });

  it("does not stick without a threshold", () => {
    const snapped = moveCrop({ x: 41, y: 14, width: 20, height: 20 }, 0, 0, bounds, 0);
    expect(snapped.rect.x).toBe(41);
    expect(snapped.guides).toEqual([]);
  });
});

describe("resizeCrop", () => {
  const rect = { x: 20, y: 10, width: 40, height: 20 };

  it("grows from the east and south edges", () => {
    expect(resizeCrop(rect, "e", 10, 0, bounds).rect.width).toBe(50);
    expect(resizeCrop(rect, "s", 0, 5, bounds).rect.height).toBe(25);
  });

  it("keeps the opposite edge anchored", () => {
    const west = resizeCrop(rect, "w", 5, 0, bounds).rect;
    expect(west).toEqual({ x: 25, y: 10, width: 35, height: 20 });
    const north = resizeCrop(rect, "n", 0, 4, bounds).rect;
    expect(north).toEqual({ x: 20, y: 14, width: 40, height: 16 });
  });

  it("clamps at the image borders", () => {
    expect(resizeCrop(rect, "e", 500, 0, bounds).rect).toEqual({
      x: 20,
      y: 10,
      width: 80,
      height: 20,
    });
    expect(resizeCrop(rect, "w", -500, 0, bounds).rect.x).toBe(0);
  });

  it("stops shrinking at the minimum size", () => {
    expect(resizeCrop(rect, "e", -500, 0, bounds, { minSize: 8 }).rect).toEqual({
      x: 20,
      y: 10,
      width: 8,
      height: 20,
    });
    expect(resizeCrop(rect, "n", 0, 500, bounds, { minSize: 8 }).rect.height).toBe(8);
  });

  it("holds the requested ratio on a corner", () => {
    const wide = resizeCrop(rect, "se", 10, 0, bounds, { ratio: 2 }).rect;
    expect(wide.width / wide.height).toBe(2);
    expect(wide.x).toBe(20);
    expect(wide.y).toBe(10);
  });

  it("keeps the opposite corner anchored while holding the ratio", () => {
    const resized = resizeCrop({ x: 20, y: 10, width: 40, height: 20 }, "nw", -10, -10, bounds, {
      ratio: 2,
    }).rect;
    expect(resized.x + resized.width).toBe(60);
    expect(resized.y + resized.height).toBe(30);
    expect(resized.width / resized.height).toBe(2);
  });

  it("snaps a single side to a square", () => {
    const snapped = resizeCrop({ x: 0, y: 0, width: 40, height: 44 }, "e", 2, 0, bounds, {
      snapThreshold: 3,
    }).rect;
    expect(snapped).toEqual({ x: 0, y: 0, width: 44, height: 44 });
  });

  it("snaps a side to the image edge", () => {
    const snapped = resizeCrop({ x: 0, y: 0, width: 40, height: 20 }, "w", 2, 0, bounds, {
      snapThreshold: 4,
    });
    expect(snapped.rect.x).toBe(0);
    expect(snapped.guides).toContainEqual({ axis: "x", value: 0 });
  });

  it("leaves corners free of the square snap", () => {
    const free = resizeCrop({ x: 0, y: 0, width: 40, height: 42 }, "se", 0, 0, bounds, {
      snapThreshold: 3,
    }).rect;
    expect(free).toEqual({ x: 0, y: 0, width: 40, height: 42 });
  });

  it("routes the move handle to moving", () => {
    expect(resizeCrop({ x: 10, y: 10, width: 20, height: 20 }, "move", 5, 5, bounds).rect).toEqual({
      x: 15,
      y: 15,
      width: 20,
      height: 20,
    });
  });
});

describe("snapRect", () => {
  it("does nothing without a threshold", () => {
    expect(snapRect({ x: 3, y: 3, width: 20, height: 20 }, "e", bounds, 0)).toEqual({
      rect: { x: 3, y: 3, width: 20, height: 20 },
      guides: [],
    });
  });
});

describe("startCrop", () => {
  it("builds a rect from a diagonal drag", () => {
    expect(startCrop({ x: 10, y: 10 }, { x: 40, y: 30 }, bounds).rect).toEqual({
      x: 10,
      y: 10,
      width: 30,
      height: 20,
    });
  });

  it("normalizes a drag in any direction", () => {
    const expected = { x: 10, y: 10, width: 30, height: 20 };
    expect(startCrop({ x: 40, y: 30 }, { x: 10, y: 10 }, bounds).rect).toEqual(expected);
    expect(startCrop({ x: 40, y: 10 }, { x: 10, y: 30 }, bounds).rect).toEqual(expected);
    expect(startCrop({ x: 10, y: 30 }, { x: 40, y: 10 }, bounds).rect).toEqual(expected);
  });

  it("keeps a drag that is too small to be useful, down to a single pixel", () => {
    expect(startCrop({ x: 20, y: 20 }, { x: 23, y: 22 }, bounds).rect).toEqual({
      x: 20,
      y: 20,
      width: 3,
      height: 2,
    });
    expect(startCrop({ x: 20, y: 20 }, { x: 20, y: 20 }, bounds).rect).toEqual({
      x: 20,
      y: 20,
      width: 1,
      height: 1,
    });
  });

  it("clamps a drag that leaves the image", () => {
    expect(startCrop({ x: 90, y: 40 }, { x: 500, y: 500 }, bounds).rect).toEqual({
      x: 90,
      y: 40,
      width: 10,
      height: 10,
    });
    expect(startCrop({ x: 0, y: 0 }, { x: -50, y: -50 }, bounds).rect).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it("sticks the moving corner to the middle and reports the guide", () => {
    const snapped = startCrop({ x: 10, y: 5 }, { x: 52, y: 24 }, bounds, { snapThreshold: 3 });
    expect(snapped.rect.x).toBe(10);
    expect(snapped.rect.width).toBe(40);
    expect(snapped.rect.height).toBe(20);
    expect(snapped.guides).toContainEqual({ axis: "x", value: 50 });
    expect(snapped.guides).toContainEqual({ axis: "y", value: 25 });
  });

  it("does not stick without a threshold", () => {
    const snapped = startCrop({ x: 10, y: 5 }, { x: 52, y: 24 }, bounds, { snapThreshold: 0 });
    expect(snapped.rect.width).toBe(42);
    expect(snapped.guides).toEqual([]);
  });

  it("keeps a square while the modifier is held", () => {
    expect(startCrop({ x: 10, y: 5 }, { x: 40, y: 30 }, bounds, { square: true }).rect).toEqual({
      x: 10,
      y: 5,
      width: 30,
      height: 30,
    });
  });

  it("grows the square along the dominant axis and back towards the anchor", () => {
    const down = startCrop({ x: 20, y: 5 }, { x: 30, y: 40 }, bounds, { square: true }).rect;
    expect(down).toEqual({ x: 20, y: 5, width: 35, height: 35 });
    const up = startCrop({ x: 40, y: 45 }, { x: 20, y: 10 }, bounds, { square: true }).rect;
    expect(up).toEqual({ x: 5, y: 10, width: 35, height: 35 });
  });

  it("keeps the square inside the image", () => {
    const rect = startCrop({ x: 95, y: 45 }, { x: 200, y: 200 }, bounds, { square: true }).rect;
    expect(rect).toEqual({ x: 50, y: 0, width: 50, height: 50 });
    expect(rect.width).toBe(rect.height);
  });

  it("leaves a square drag to the size gate instead of snapping it", () => {
    const small = startCrop({ x: 10, y: 10 }, { x: 14, y: 12 }, bounds, { square: true });
    expect(small.rect.width).toBe(4);
    expect(small.rect.height).toBe(4);
    expect(small.guides).toEqual([]);
  });
});

describe("scale helpers", () => {
  it("converts the snap threshold into source pixels", () => {
    expect(snapThresholdForScale(1)).toBe(6);
    expect(snapThresholdForScale(3)).toBe(2);
    expect(snapThresholdForScale(0)).toBe(6);
  });

  it("fits the whole image into the container and centers it", () => {
    const box = { width: 200, height: 200 };
    expect(fitView(bounds, box)).toEqual({
      scale: 2,
      left: 0,
      top: 50,
      width: 200,
      height: 100,
    });
    expect(fitView({ width: 400, height: 400 }, box)).toEqual({
      scale: 0.5,
      left: 0,
      top: 0,
      width: 200,
      height: 200,
    });
  });

  it("scales about the box centre when zoomed and follows the pan", () => {
    const box = { width: 200, height: 200 };
    const view = fitView(bounds, box, 2);
    expect(view).toEqual({ scale: 4, left: -100, top: 0, width: 400, height: 200 });
    const panned = fitView(bounds, box, 2, { x: 30, y: -10 });
    expect(panned.left).toBe(-70);
    expect(panned.top).toBe(-10);
  });

  it("clamps the zoom to the configured range", () => {
    const box = { width: 100, height: 50 };
    expect(fitView(bounds, box, 0).scale).toBe(0.5);
    expect(fitView(bounds, box, 99).scale).toBe(8);
  });

  it("pulls the picture back inside the box below the fit", () => {
    const box = { width: 100, height: 50 };
    const view = fitView(bounds, box, 0.5);
    expect(view.width).toBe(50);
    expect(view.height).toBe(25);
    expect(view.left).toBe(25);
    expect(view.top).toBe(12.5);
    expect(view.width).toBeLessThan(box.width);
  });

  it("never asks for more room than the container has", () => {
    const box = { width: 90, height: 70 };
    const view = fitView(bounds, box);
    expect(view.width).toBeLessThanOrEqual(box.width);
    expect(view.height).toBeLessThanOrEqual(box.height);
  });

  it("falls back to one to one when the container has no size", () => {
    expect(fitView(bounds, { width: 0, height: 0 })).toEqual({
      scale: 1,
      left: 0,
      top: 0,
      width: 100,
      height: 50,
    });
  });

  it("keeps an axis that already fits from panning", () => {
    const box = { width: 200, height: 200 };
    expect(clampPan(bounds, box, 1, { x: 40, y: 40 })).toEqual({ x: 0, y: 0 });
    expect(clampPan(bounds, box, 2, { x: 40, y: 400 })).toEqual({ x: 40, y: 0 });
    expect(clampPan(bounds, box, 2, { x: 400, y: 0 })).toEqual({ x: 100, y: 0 });
  });

  it("zooms around the pointer so that pixel stays put", () => {
    const box = { width: 200, height: 160 };
    const point = { x: 120, y: 70 };
    const before = fitView(bounds, box, 1);
    const source = {
      x: (point.x - before.left) / before.scale,
      y: (point.y - before.top) / before.scale,
    };
    const { zoom, pan } = zoomAtPoint(bounds, box, 1, { x: 0, y: 0 }, 2, point);
    expect(zoom).toBe(2);
    expect(pan).toEqual({ x: -20, y: 10 });
    const after = fitView(bounds, box, zoom, pan);
    expect(after.left + source.x * after.scale).toBeCloseTo(point.x, 5);
    expect(after.top + source.y * after.scale).toBeCloseTo(point.y, 5);
  });
  it("zooming back out lands on the fit with no pan", () => {
    expect(
      zoomAtPoint(bounds, { width: 200, height: 160 }, 1.2, { x: 30, y: 30 }, 1 / 1.2, {
        x: 10,
        y: 10,
      })
    ).toEqual({ zoom: 1, pan: { x: 0, y: 0 } });
  });

  it("allows zooming below the fit and stops at the floor", () => {
    const box = { width: 200, height: 160 };
    const out = zoomAtPoint(bounds, box, 1, { x: 0, y: 0 }, 1 / 1.2, { x: 100, y: 80 });
    expect(out.zoom).toBe(0.833);
    expect(out.pan).toEqual({ x: 0, y: 0 });
    const floor = zoomAtPoint(bounds, box, 0.6, { x: 40, y: 40 }, 1 / 1.2, { x: 100, y: 80 });
    expect(floor).toEqual({ zoom: 0.5, pan: { x: 0, y: 0 } });
  });

  it("knows what counts as inside the picture", () => {
    expect(isInsidePicture({ x: 0, y: 0 }, bounds)).toBe(true);
    expect(isInsidePicture({ x: 100, y: 50 }, bounds)).toBe(true);
    expect(isInsidePicture({ x: -1, y: 10 }, bounds)).toBe(false);
    expect(isInsidePicture({ x: 10, y: 51 }, bounds)).toBe(false);
  });

  it("does nothing at the zoom ceiling", () => {
    const pan = { x: 10, y: 10 };
    expect(zoomAtPoint(bounds, { width: 200, height: 200 }, 8, pan, 1.2, { x: 10, y: 10 })).toEqual(
      { zoom: 8, pan }
    );
  });

  it("round trips a rect through display coordinates", () => {
    const rect = { x: 10, y: 5, width: 40, height: 25 };
    expect(fromFrame(toFrame(rect, 2.5), 2.5)).toEqual(rect);
  });
});

describe("crop predicates", () => {
  it("detects a square selection", () => {
    expect(isSquare({ x: 0, y: 0, width: 12, height: 12 })).toBe(true);
    expect(isSquare({ x: 0, y: 0, width: 12, height: 11 })).toBe(false);
    expect(isSquare({ x: 0, y: 0, width: 0, height: 0 })).toBe(false);
  });

  it("detects the untouched selection", () => {
    expect(isFullCrop(fullCrop(bounds), bounds)).toBe(true);
    expect(isFullCrop({ x: 1, y: 0, width: 100, height: 50 }, bounds)).toBe(false);
    expect(isFullCrop({ x: 0, y: 0, width: 99, height: 50 }, bounds)).toBe(false);
  });
});
