export interface TreeRow {
  path: string;
  depth: number;
  kind: "folder" | "file";
  expanded: boolean;
  parent?: string;
}

export type TreeArrowResult =
  | { kind: "toggle"; path: string }
  | { kind: "focus"; path: string }
  | null;

export interface RelativeRowNumber {
  label: number;
  current: boolean;
}
