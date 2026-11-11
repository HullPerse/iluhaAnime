import type { CollisionBox } from "@/types/core/collisionAabb";
import { bucketRows } from "@/lib/core/graphics/collisionBroad.utils";
import type { RowCollisionOptions, RowCollisionResult } from "@/types/core/collisionResolve";

const DEFAULT_MAX_PASSES = 5;

function rowEdge(
  index: number,
  placed: readonly number[],
  boxes: readonly CollisionBox[],
  left: readonly number[],
  width: readonly number[],
  rowGap: number,
  filter: (index: number, other: number) => boolean
): number {
  let edge = left[index] ?? 0;
  for (const other of placed) {
    const sameRow = Math.abs((boxes[index]?.minY ?? 0) - (boxes[other]?.minY ?? 0)) < rowGap;
    const overlaps =
      sameRow &&
      edge < (left[other] ?? 0) + (width[other] ?? 0) &&
      edge + (width[index] ?? 0) > (left[other] ?? 0);
    if (filter(index, other) && overlaps) edge = (left[other] ?? 0) + (width[other] ?? 0);
  }
  return edge;
}

function resolveRow(
  row: readonly number[],
  boxes: readonly CollisionBox[],
  left: number[],
  width: readonly number[],
  rowGap: number,
  anchored: (index: number) => boolean,
  filter: (index: number, other: number) => boolean
): boolean {
  const placed: number[] = [];
  const order = [...row].sort(
    (a, b) => Number(anchored(b)) - Number(anchored(a)) || (left[a] ?? 0) - (left[b] ?? 0)
  );
  let moved = false;
  for (const index of order) {
    if (!anchored(index)) {
      const edge = rowEdge(index, placed, boxes, left, width, rowGap, filter);
      if (edge !== left[index]) {
        left[index] = edge;
        moved = true;
      }
    }
    placed.push(index);
  }
  return moved;
}

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
      moved = resolveRow(row, boxes, left, width, rowGap, anchored, filter) || moved;
    }
    if (!moved) break;
  }
  const moved: number[] = [];
  boxes.forEach((box, index) => {
    if (left[index] !== box.minX) moved.push(index);
  });
  return { left, moved };
}
