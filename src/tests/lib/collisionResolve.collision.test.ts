import { describe, expect, it } from "vitest";

import type { CollisionBox } from "@/types/core/collisionAabb";
import { resolveRowCollisions } from "@/lib/core/collisionResolve.utils";

const ROW_GAP = 20;

function box(left: number, top: number, width: number): CollisionBox {
  return { minX: left, minY: top, maxX: left + width, maxY: top };
}

describe("resolveRowCollisions", () => {
  it("returns empty results for empty input", () => {
    expect(resolveRowCollisions([], { rowGap: ROW_GAP })).toEqual({ left: [], moved: [] });
  });

  it("leaves non-overlapping boxes alone", () => {
    const boxes = [box(0, 10, 20), box(40, 10, 20)];
    expect(resolveRowCollisions(boxes, { rowGap: ROW_GAP })).toEqual({
      left: [0, 40],
      moved: [],
    });
  });

  it("leaves touching edges alone", () => {
    const boxes = [box(0, 10, 20), box(20, 10, 20)];
    expect(resolveRowCollisions(boxes, { rowGap: ROW_GAP }).left).toEqual([0, 20]);
  });

  it("leaves other rows alone", () => {
    const boxes = [box(0, 10, 100), box(10, 100, 20)];
    expect(resolveRowCollisions(boxes, { rowGap: ROW_GAP }).left).toEqual([0, 10]);
  });

  it("shifts an intersecting neighbor to the covering edge and reports it", () => {
    const boxes = [box(10, 10, 60), box(40, 10, 20)];
    expect(resolveRowCollisions(boxes, { rowGap: ROW_GAP })).toEqual({
      left: [10, 70],
      moved: [1],
    });
  });

  it("cascades through stacked neighbors and stays idempotent", () => {
    const boxes = [box(10, 10, 60), box(40, 10, 20), box(55, 10, 20)];
    const once = resolveRowCollisions(boxes, { rowGap: ROW_GAP });
    expect(once.left).toEqual([10, 70, 90]);
    const twice = resolveRowCollisions(
      once.left.map((left, index) => {
        const source = boxes[index]!;
        return { ...source, minX: left, maxX: left + (source.maxX - source.minX) };
      }),
      { rowGap: ROW_GAP }
    );
    expect(twice.moved).toEqual([]);
  });

  it("never moves an anchor; neighbors move instead", () => {
    const boxes = [box(40, 10, 20), box(10, 10, 60)];
    const result = resolveRowCollisions(boxes, {
      rowGap: ROW_GAP,
      anchored: (index) => index === 1,
    });
    expect(result.left).toEqual([70, 10]);
    expect(result.moved).toEqual([0]);
  });

  it("places anchors before neighbors regardless of top order", () => {
    const boxes = [box(0, 5, 30), box(10, 10, 60)];
    const result = resolveRowCollisions(boxes, {
      rowGap: ROW_GAP,
      anchored: (index) => index === 1,
    });
    expect(result.left[0]).toBe(70);
    expect(result.left[1]).toBe(10);
  });

  it("skips pairs rejected by the filter", () => {
    const boxes = [box(10, 10, 60), box(40, 10, 20)];
    const result = resolveRowCollisions(boxes, {
      rowGap: ROW_GAP,
      filter: () => false,
    });
    expect(result.left).toEqual([10, 40]);
    expect(result.moved).toEqual([]);
  });

  it("moves nothing when maxPasses is zero", () => {
    const boxes = [box(10, 10, 60), box(40, 10, 20)];
    expect(resolveRowCollisions(boxes, { rowGap: ROW_GAP, maxPasses: 0 }).left).toEqual([10, 40]);
  });
});
