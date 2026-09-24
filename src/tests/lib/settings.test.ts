import { describe, expect, it, vi } from "vitest";

import {
  ANNOTATION_HISTORY_LIMIT,
  ANNOTATION_TEXT_LINE_HEIGHT,
} from "@/config/settings/screenshot.config";
import {
  blurPreviewSigma,
  measureText,
  paintAnnotations,
  paintBlurMask,
  paintStroke,
  paintText,
} from "@/lib/settings/annotation.draw";
import {
  appendPoint,
  blurSigmaFor,
  canRedo,
  canUndo,
  commit,
  createHistory,
  hasBlur,
  hasInk,
  hitTestText,
  isBlurItem,
  isInkItem,
  moveText,
  nextAnnotationId,
  redo,
  replaceText,
  textBounds,
  undo,
  withDraft,
} from "@/lib/settings/annotation.utils";
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
import {
  canSaveScreenshot,
  defaultScreenshotName,
  matchesScreenshotHotkey,
} from "@/lib/settings/screenshot.utils";
import { toSessionConfig } from "@/lib/settings/session.utils";
import { buildTrayMenuEntries, shouldHideOnClose } from "@/lib/settings/tray.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AnnotationItem, StrokeItem, TextItem } from "@/types/screenshot";

describe("settings/annotation-draw", () => {
  function fakeContext() {
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      canvas: { width: 200, height: 100 },
      fillStyle: "",
      font: "",
      globalCompositeOperation: "source-over",
      lineCap: "",
      lineJoin: "",
      lineWidth: 1,
      strokeStyle: "",
      textAlign: "",
      textBaseline: "",
    };
    return context;
  }

  type FakeContext = ReturnType<typeof fakeContext>;

  const asContext = (context: FakeContext) => context as unknown as CanvasRenderingContext2D;

  function stroke(overrides: Partial<StrokeItem> = {}): StrokeItem {
    return {
      id: "s1",
      kind: "stroke",
      tool: "pencil",
      color: "#ff0000",
      size: 6,
      points: [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
      ],
      ...overrides,
    };
  }

  function text(overrides: Partial<TextItem> = {}): TextItem {
    return {
      id: "t1",
      kind: "text",
      color: "#00ff00",
      size: 28,
      point: { x: 10, y: 20 },
      text: "note",
      width: 60,
      height: 34,
      ...overrides,
    };
  }

  describe("paintStroke", () => {
    it("strokes the path with the colour, width and round joins", () => {
      const context = fakeContext();
      paintStroke(asContext(context), stroke().points, "#123456", 9);
      expect(context.strokeStyle).toBe("#123456");
      expect(context.lineWidth).toBe(9);
      expect(context.lineCap).toBe("round");
      expect(context.lineJoin).toBe("round");
      expect(context.globalCompositeOperation).toBe("source-over");
      expect(context.moveTo).toHaveBeenCalledWith(1, 1);
      expect(context.lineTo).toHaveBeenCalledWith(5, 5);
      expect(context.stroke).toHaveBeenCalledTimes(1);
      expect(context.restore).toHaveBeenCalledTimes(1);
    });

    it("cuts the pixels out for the eraser", () => {
      const context = fakeContext();
      paintStroke(asContext(context), stroke().points, "#000000", 6, true);
      expect(context.globalCompositeOperation).toBe("destination-out");
    });

    it("still leaves a dot behind for a single tap", () => {
      const context = fakeContext();
      paintStroke(asContext(context), [{ x: 4, y: 7 }], "#000000", 6);
      expect(context.moveTo).toHaveBeenCalledWith(4, 7);
      expect(context.lineTo).toHaveBeenCalledWith(4, 7);
      expect(context.stroke).toHaveBeenCalledTimes(1);
    });

    it("does nothing without points", () => {
      const context = fakeContext();
      paintStroke(asContext(context), [], "#000000", 6);
      expect(context.stroke).not.toHaveBeenCalled();
      expect(context.save).not.toHaveBeenCalled();
    });
  });

  describe("paintText", () => {
    it("draws the wording at the click point with the theme font", () => {
      const context = fakeContext();
      paintText(asContext(context), text(), '"MS Sans Serif", sans-serif');
      expect(context.font).toBe('28px "MS Sans Serif", sans-serif');
      expect(context.fillStyle).toBe("#00ff00");
      expect(context.textBaseline).toBe("top");
      expect(context.textAlign).toBe("left");
      expect(context.fillText).toHaveBeenCalledWith("note", 10, 20);
    });

    it("skips empty text", () => {
      const context = fakeContext();
      paintText(asContext(context), text({ text: "" }), "sans-serif");
      expect(context.fillText).not.toHaveBeenCalled();
    });
  });

  describe("measureText", () => {
    it("falls back to an estimate without a context", () => {
      expect(measureText(null, "sans-serif", 20, "abcd")).toEqual({
        width: 48,
        height: 24,
      });
    });

    it("uses the real measurement when there is one", () => {
      const context = fakeContext();
      expect(measureText(asContext(context), "sans-serif", 20, "abcd")).toEqual({
        width: 28,
        height: 20 * ANNOTATION_TEXT_LINE_HEIGHT,
      });
      expect(context.font).toBe("20px sans-serif");
    });

    it("keeps a minimum width for a single glyph", () => {
      const context = fakeContext();
      context.measureText.mockReturnValue({ width: 0 });
      expect(measureText(asContext(context), "sans-serif", 20, "|").width).toBe(8);
    });
  });

  describe("paintAnnotations", () => {
    it("clears the layer before every repaint", () => {
      const context = fakeContext();
      paintAnnotations(asContext(context), [stroke()], "sans-serif");
      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
    });

    it("paints the pencil in colour and the eraser as a cut", () => {
      const context = fakeContext();
      paintAnnotations(asContext(context), [stroke()], "sans-serif");
      expect(context.strokeStyle).toBe("#ff0000");
      expect(context.globalCompositeOperation).toBe("source-over");

      const erasing = fakeContext();
      paintAnnotations(asContext(erasing), [stroke({ tool: "eraser" })], "sans-serif");
      expect(erasing.globalCompositeOperation).toBe("destination-out");
    });

    it("leaves a committed blur to the preview and only hints a running one", () => {
      const committed = fakeContext();
      paintAnnotations(asContext(committed), [stroke({ tool: "blur" })], "sans-serif");
      expect(committed.stroke).not.toHaveBeenCalled();
      expect(committed.fillText).not.toHaveBeenCalled();

      const running = fakeContext();
      paintAnnotations(asContext(running), [stroke({ tool: "blur" })], "sans-serif", "s1");
      expect(running.stroke).toHaveBeenCalledTimes(1);
      expect(running.globalCompositeOperation).toBe("source-over");
    });

    it("paints text and strokes in the order they were made", () => {
      const context = fakeContext();
      const items: AnnotationItem[] = [stroke(), text()];
      paintAnnotations(asContext(context), items, "sans-serif");
      expect(context.stroke).toHaveBeenCalledTimes(1);
      expect(context.fillText).toHaveBeenCalledTimes(1);
    });

    it("survives a missing context", () => {
      expect(() => paintAnnotations(null, [stroke()], "sans-serif")).not.toThrow();
    });
  });

  describe("paintBlurMask", () => {
    it("clears the mask and paints only the blur strokes in white", () => {
      const context = fakeContext();
      const blur = stroke({ tool: "blur" });
      paintBlurMask(asContext(context), [stroke(), text(), blur]);
      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
      expect(context.stroke).toHaveBeenCalledTimes(1);
      expect(context.strokeStyle).toBe("#ffffff");
      expect(context.lineWidth).toBe(blur.size);
      expect(context.fillText).not.toHaveBeenCalled();
    });

    it("rubs the blur out with the eraser, in the order the marks were made", () => {
      const context = fakeContext();
      const modes: string[] = [];
      context.stroke.mockImplementation(() => {
        modes.push(context.globalCompositeOperation);
      });
      paintBlurMask(asContext(context), [
        stroke({ id: "blur-1", tool: "blur" }),
        stroke({ id: "erase-1", tool: "eraser" }),
        stroke({ id: "blur-2", tool: "blur" }),
      ]);
      expect(modes).toEqual(["source-over", "destination-out", "source-over"]);
      expect(context.strokeStyle).toBe("#ffffff");
    });

    it("leaves the mask alone for the eraser alone and for a pencil", () => {
      const context = fakeContext();
      paintBlurMask(asContext(context), [text(), stroke({ tool: "eraser" })]);
      expect(context.stroke).toHaveBeenCalledTimes(1);
      expect(context.globalCompositeOperation).toBe("destination-out");
    });
  });

  describe("blurPreviewSigma", () => {
    it("is silent without a blur", () => {
      expect(blurPreviewSigma([stroke(), text()])).toBe(0);
    });

    it("follows the first blur stroke", () => {
      expect(blurPreviewSigma([stroke({ tool: "blur", size: 12 })])).toBe(18);
    });
  });
});

describe("settings/annotation-utils", () => {
  function stroke(overrides: Partial<StrokeItem> = {}): StrokeItem {
    return {
      id: nextAnnotationId(),
      kind: "stroke",
      tool: "pencil",
      color: "#ff0000",
      size: 6,
      points: [{ x: 0, y: 0 }],
      ...overrides,
    };
  }

  function text(overrides: Partial<TextItem> = {}): TextItem {
    return {
      id: nextAnnotationId(),
      kind: "text",
      color: "#ffffff",
      size: 28,
      point: { x: 10, y: 20 },
      text: "note",
      width: 60,
      height: 34,
      ...overrides,
    };
  }

  describe("nextAnnotationId", () => {
    it("hands out a fresh id every time", () => {
      const first = nextAnnotationId();
      const second = nextAnnotationId();
      expect(first).not.toBe(second);
    });
  });

  describe("appendPoint", () => {
    it("drops a point that lands on the previous one", () => {
      const points = [{ x: 0, y: 0 }];
      expect(appendPoint(points, { x: 1, y: 0 })).toBe(points);
    });

    it("keeps a point once the stroke has moved far enough", () => {
      const points = [{ x: 0, y: 0 }];
      expect(appendPoint(points, { x: 5, y: 0 })).toEqual([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ]);
    });

    it("measures the distance diagonally", () => {
      const points = [{ x: 0, y: 0 }];
      expect(appendPoint(points, { x: 2, y: 2 })).toHaveLength(2);
    });
  });

  describe("withDraft", () => {
    it("returns the list untouched without a draft", () => {
      const items = [stroke()];
      expect(withDraft(items, null)).toBe(items);
    });

    it("appends a draft that is not committed yet", () => {
      const items = [stroke()];
      const draft = stroke();
      expect(withDraft(items, draft)).toEqual([...items, draft]);
    });

    it("swaps a committed item for its draft", () => {
      const first = stroke();
      const items: AnnotationItem[] = [first];
      const draft = { ...first, points: [{ x: 9, y: 9 }] };
      expect(withDraft(items, draft)).toEqual([draft]);
    });
  });

  describe("layer split", () => {
    it("counts text and every painting stroke as ink", () => {
      expect(isInkItem(text())).toBe(true);
      expect(isInkItem(stroke())).toBe(true);
      expect(isInkItem(stroke({ tool: "eraser" }))).toBe(true);
      expect(isInkItem(stroke({ tool: "blur" }))).toBe(false);
    });

    it("keeps the blur on its own layer", () => {
      expect(isBlurItem(stroke({ tool: "blur" }))).toBe(true);
      expect(isBlurItem(stroke())).toBe(false);
      expect(isBlurItem(text())).toBe(false);
    });

    it("reports what is on each layer", () => {
      expect(hasInk([text()])).toBe(true);
      expect(hasInk([stroke({ tool: "blur" })])).toBe(false);
      expect(hasBlur([stroke({ tool: "blur" }), text()])).toBe(true);
      expect(hasBlur([])).toBe(false);
    });
  });

  describe("blurSigmaFor", () => {
    it("grows with the brush", () => {
      expect(blurSigmaFor(6)).toBe(9);
    });

    it("never lands below the visible floor", () => {
      expect(blurSigmaFor(0)).toBe(0.5);
    });
  });

  describe("history", () => {
    it("starts empty", () => {
      const history = createHistory();
      expect(history.present).toEqual([]);
      expect(canUndo(history)).toBe(false);
      expect(canRedo(history)).toBe(false);
    });

    it("ignores a commit that changes nothing", () => {
      const history = createHistory();
      const items = [stroke()];
      const once = commit(history, items);
      expect(commit(once, items)).toBe(once);
    });

    it("walks back and forward through the snapshots", () => {
      const first = [stroke()];
      const second = [...first, text()];
      let history = createHistory();
      history = commit(history, first);
      history = commit(history, second);
      expect(history.present).toBe(second);
      expect(canUndo(history)).toBe(true);
      expect(canRedo(history)).toBe(false);

      history = undo(history);
      expect(history.present).toBe(first);

      history = undo(history);
      expect(history.present).toEqual([]);
      expect(canUndo(history)).toBe(false);
      expect(undo(history)).toBe(history);

      history = redo(history);
      expect(history.present).toBe(first);
      history = redo(history);
      expect(history.present).toBe(second);
      expect(redo(history)).toBe(history);
    });

    it("drops the redo branch once something new is committed", () => {
      let history = createHistory();
      history = commit(history, [stroke()]);
      history = commit(history, [stroke()]);
      history = undo(history);
      expect(canRedo(history)).toBe(true);
      history = commit(history, [text()]);
      expect(canRedo(history)).toBe(false);
    });

    it("keeps the undo stack bounded", () => {
      let history = createHistory();
      for (let step = 0; step <= ANNOTATION_HISTORY_LIMIT; step += 1) {
        history = commit(history, [stroke()]);
      }
      expect(history.past).toHaveLength(ANNOTATION_HISTORY_LIMIT);
    });
  });

  describe("textBounds", () => {
    it("boxes the text and pads it", () => {
      expect(textBounds(text(), 3)).toEqual({ left: 7, top: 17, right: 73, bottom: 57 });
    });
  });

  describe("hitTestText", () => {
    it("hits a text under the point", () => {
      const item = text();
      expect(hitTestText([item], { x: 20, y: 30 })?.id).toBe(item.id);
    });

    it("prefers the text that was written last", () => {
      const under = text();
      const over = text({ point: { x: 10, y: 20 } });
      expect(hitTestText([under, over], { x: 20, y: 30 })?.id).toBe(over.id);
    });

    it("misses outside the box and ignores strokes", () => {
      expect(hitTestText([text()], { x: 300, y: 300 })).toBeNull();
      expect(hitTestText([stroke()], { x: 0, y: 0 })).toBeNull();
    });

    it("reaches a little past the box", () => {
      const item = text();
      expect(hitTestText([item], { x: 72, y: 30 }, 3)?.id).toBe(item.id);
      expect(hitTestText([item], { x: 80, y: 30 }, 3)).toBeNull();
    });
  });

  describe("text helpers", () => {
    it("moves a text without touching the rest", () => {
      const item = text();
      const moved = moveText(item, { x: 1, y: 2 });
      expect(moved.point).toEqual({ x: 1, y: 2 });
      expect(moved.text).toBe(item.text);
    });

    it("replaces the wording and its measured size", () => {
      const item = text();
      const next = replaceText(item, "longer", { width: 90, height: 34 });
      expect(next.text).toBe("longer");
      expect(next.width).toBe(90);
    });
  });
});

describe("settings/crop", () => {
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
      expect(moveCrop(rect, 100, 100, bounds).rect).toEqual({
        x: 80,
        y: 30,
        width: 20,
        height: 20,
      });
      expect(moveCrop(rect, -100, -100, bounds).rect).toEqual({
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      });
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
      expect(
        resizeCrop({ x: 10, y: 10, width: 20, height: 20 }, "move", 5, 5, bounds).rect
      ).toEqual({
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
      expect(
        zoomAtPoint(bounds, { width: 200, height: 200 }, 8, pan, 1.2, { x: 10, y: 10 })
      ).toEqual({ zoom: 8, pan });
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
});

describe("settings/screenshot", () => {
  function chord(partial: {
    code?: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }) {
    return {
      code: "KeyP",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      ...partial,
    };
  }

  describe("matchesScreenshotHotkey", () => {
    it("matches ctrl shift P exactly", () => {
      expect(matchesScreenshotHotkey(chord({}))).toBe(true);
    });

    it("rejects a missing modifier", () => {
      expect(matchesScreenshotHotkey(chord({ ctrlKey: false }))).toBe(false);
      expect(matchesScreenshotHotkey(chord({ shiftKey: false }))).toBe(false);
    });

    it("rejects an extra modifier", () => {
      expect(matchesScreenshotHotkey(chord({ altKey: true }))).toBe(false);
      expect(matchesScreenshotHotkey(chord({ metaKey: true }))).toBe(false);
    });

    it("rejects another key", () => {
      expect(matchesScreenshotHotkey(chord({ code: "KeyO" }))).toBe(false);
      expect(matchesScreenshotHotkey(chord({ code: "P" }))).toBe(false);
    });

    it("ignores the physical layout value in favour of the code", () => {
      expect(matchesScreenshotHotkey(chord({ code: "KeyP" }))).toBe(true);
    });
  });

  describe("defaultScreenshotName", () => {
    it("uses the product prefix", () => {
      expect(defaultScreenshotName()).toBe("iluhaAnime_screenshot");
    });
  });

  describe("canSaveScreenshot", () => {
    it("requires both a name and a folder", () => {
      expect(canSaveScreenshot("shot", "D:/Shots")).toBe(true);
      expect(canSaveScreenshot("   ", "D:/Shots")).toBe(false);
      expect(canSaveScreenshot("shot", "   ")).toBe(false);
      expect(canSaveScreenshot("", "")).toBe(false);
    });
  });
});

describe("settings/session", () => {
  describe("toSessionConfig", () => {
    it("maps the current settings into a session payload", () => {
      useSettingsStore.setState({
        disablePersistence: true,
        enableUpnp: true,
        fastresumeEnabled: false,
        ipv4Only: true,
        listenPort: 51413,
        peerConnectTimeout: 45,
        peerReadWriteTimeout: 20,
        torrentProxyUrl: "socks5://127.0.0.1:10808",
        fileOrder: "torrent",
      });

      expect(toSessionConfig()).toEqual({
        disablePersistence: true,
        enableUpnp: true,
        fastresume: false,
        fileOrder: "torrent",
        ipv4Only: true,
        listenPort: 51413,
        peerConnectTimeout: 45,
        peerReadWriteTimeout: 20,
        proxyUrl: "socks5://127.0.0.1:10808",
      });
    });

    it("sends a null proxy when the setting is unset", () => {
      useSettingsStore.setState({ torrentProxyUrl: null });

      expect(toSessionConfig().proxyUrl).toBe(null);
    });
  });
});

describe("settings/tray", () => {
  describe("shouldHideOnClose", () => {
    it("hides the window when minimize to tray is on and quit was not requested", () => {
      expect(shouldHideOnClose(true, false)).toBe(true);
    });

    it("closes the app after the tray quit item allowed quitting", () => {
      expect(shouldHideOnClose(true, true)).toBe(false);
    });

    it("closes the app when minimize to tray is off", () => {
      expect(shouldHideOnClose(false, false)).toBe(false);
      expect(shouldHideOnClose(false, true)).toBe(false);
    });
  });

  describe("buildTrayMenuEntries", () => {
    it("lists every visible tab before the separator and the quit item", () => {
      const entries = buildTrayMenuEntries(
        [
          { id: "search", label: "Search" },
          { id: "settings", label: "Settings" },
        ],
        "Quit"
      );
      expect(entries.map((entry) => entry.kind)).toEqual(["tab", "tab", "separator", "quit"]);
      expect(entries[0]).toMatchObject({ id: "tray-tab-search", text: "Search" });
      expect(entries[2]).toMatchObject({ id: "tray-separator" });
      expect(entries[3]).toMatchObject({ id: "tray-quit", text: "Quit" });
    });

    it("omits disabled tabs instead of rendering them", () => {
      const entries = buildTrayMenuEntries([{ id: "torrent", label: "Torrents" }], "Quit");
      expect(entries).toHaveLength(3);
      expect(entries.some((entry) => entry.id === "tray-tab-search")).toBe(false);
    });

    it("still offers quit when every tab is disabled", () => {
      const entries = buildTrayMenuEntries([], "Quit");
      expect(entries.map((entry) => entry.kind)).toEqual(["separator", "quit"]);
    });
  });
});
