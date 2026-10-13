import type { CollisionBox } from "./aabb.collision";
import { bucketRows } from "./broad.collision";

export interface RowCollisionOptions {
  /** Two boxes count as the same row while their tops differ by less than this. */
  rowGap: number;
  /** Upper bound on sweep passes; right-only shifts always terminate. */
  maxPasses?: number;
  /** Anchored boxes never move; intersecting neighbors move instead. */
  anchored?: (index: number) => boolean;
  /**
   * Planck-style category skip: `false` means the pair can never collide,
   * decided before any geometry runs. Must be symmetric in effect.
   */
  filter?: (a: number, b: number) => boolean;
}

export interface RowCollisionResult {
  /** Resolved left edge per input box, in input order. */
  left: number[];
  /** Indices whose left edge moved, in input order (Rapier-event style). */
  moved: number[];
}

const DEFAULT_MAX_PASSES = 5;

/**
 * Row-mode sweep (narrow + resolve): boxes intersecting in the same band
 * shift right to the covering edge, in band order. Pure (no DOM read),
 * idempotent - a resolved run resolves to itself, so remeasures converge
 * instead of drifting.
 *
 * Within a band anchored boxes place first, then left-to-right: an anchor
 * must occupy its edge before neighbors test against it, regardless of
 * which top is smaller. The scalar loop is the row-mode fast path of
 * `intersectsBox` (strict X overlap plus the band test) kept allocation
 * free for the per-frame hot path; the canonical predicates live in
 * `aabb.collision.ts`.
 */
export function resolveRowCollisions(
  boxes: readonly CollisionBox[],
  options: RowCollisionOptions
): RowCollisionResult {
  const { rowGap, anchored = (): boolean => false, filter = (): boolean => true } = options;
  const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES;
  const left = boxes.map((box) => box.minX);
  const width = boxes.map((box) => box.maxX - box.minX);
  const rows = bucketRows(
    boxes.map((box) => box.minY),
    rowGap
  );
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    for (const row of rows) {
      const placed: number[] = [];
      const order = [...row].sort(
        (a, b) => Number(anchored(b)) - Number(anchored(a)) || left[a] - left[b]
      );
      for (const index of order) {
        if (!anchored(index)) {
          let edge = left[index];
          for (const other of placed) {
            if (!filter(index, other)) continue;
            const sameRow = Math.abs(boxes[index].minY - boxes[other].minY) < rowGap;
            if (sameRow && edge < left[other] + width[other] && edge + width[index] > left[other]) {
              edge = left[other] + width[other];
            }
          }
          if (edge !== left[index]) {
            left[index] = edge;
            moved = true;
          }
        }
        placed.push(index);
      }
    }
    if (!moved) break;
  }
  const moved: number[] = [];
  boxes.forEach((box, index) => {
    if (left[index] !== box.minX) moved.push(index);
  });
  return { left, moved };
}
