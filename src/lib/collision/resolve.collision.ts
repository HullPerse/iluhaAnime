import type { CollisionBox } from "./aabb.collision";
import { bucketRows } from "./broad.collision";

export interface RowCollisionOptions {
  rowGap: number;
  maxPasses?: number;
  anchored?: (index: number) => boolean;
  filter?: (a: number, b: number) => boolean;
}

export interface RowCollisionResult {
  left: number[];
  moved: number[];
}

const DEFAULT_MAX_PASSES = 5;

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
