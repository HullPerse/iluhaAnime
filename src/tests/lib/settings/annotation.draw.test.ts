import { describe, expect, it, vi } from "vitest";

import { ANNOTATION_TEXT_LINE_HEIGHT } from "@/config/settings/screenshot.config";
import {
  blurPreviewSigma,
  measureText,
  paintAnnotations,
  paintBlurMask,
  paintStroke,
  paintText,
} from "@/lib/settings/annotation.draw";
import type { AnnotationItem, StrokeItem, TextItem } from "@/types/screenshot";

/// The painters only touch a handful of canvas members, so a plain object records everything a test
/// needs to see: the colour, the width and the composite mode that were current when the path was
/// stroked.
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
