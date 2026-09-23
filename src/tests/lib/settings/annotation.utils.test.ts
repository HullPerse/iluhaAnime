import { describe, expect, it } from "vitest";

import { ANNOTATION_HISTORY_LIMIT } from "@/config/settings/screenshot.config";
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
import type { AnnotationItem, StrokeItem, TextItem } from "@/types/screenshot";

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

    // The empty state is a snapshot of its own, so one more step reaches it and the step after that
    // has nowhere to go.
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
