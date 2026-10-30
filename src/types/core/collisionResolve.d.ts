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
