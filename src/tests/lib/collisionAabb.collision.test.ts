import { describe, expect, it } from "vitest";

import { containsBox, intersectsBox } from "@/lib/collisionAabb.utils";
import type { CollisionBox } from "@/lib/collisionAabb.utils";

function box(minX: number, minY: number, maxX: number, maxY: number): CollisionBox {
  return { minX, minY, maxX, maxY };
}

describe("intersectsBox", () => {
  it("detects area overlap", () => {
    expect(intersectsBox(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(true);
  });

  it("ignores disjoint boxes", () => {
    expect(intersectsBox(box(0, 0, 10, 10), box(20, 0, 30, 10))).toBe(false);
    expect(intersectsBox(box(0, 0, 10, 10), box(0, 20, 10, 30))).toBe(false);
  });

  it("treats touching edges as resolved, not colliding", () => {
    expect(intersectsBox(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false);
    expect(intersectsBox(box(0, 0, 10, 10), box(0, 10, 10, 20))).toBe(false);
    expect(intersectsBox(box(0, 0, 10, 10), box(10, 10, 20, 20))).toBe(false);
  });

  it("counts containment as intersection", () => {
    expect(intersectsBox(box(0, 0, 30, 30), box(5, 5, 10, 10))).toBe(true);
  });
});

describe("containsBox", () => {
  it("detects full containment including shared edges", () => {
    expect(containsBox(box(0, 0, 30, 30), box(5, 5, 10, 10))).toBe(true);
    expect(containsBox(box(0, 0, 30, 30), box(0, 0, 30, 30))).toBe(true);
  });

  it("rejects partial overlap", () => {
    expect(containsBox(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(false);
    expect(containsBox(box(5, 5, 10, 10), box(0, 0, 30, 30))).toBe(false);
  });
});
