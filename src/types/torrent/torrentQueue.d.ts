export type QueuePlace = "before" | "after";

export type QueueEdge = "start" | "end";

export interface QueueBlock {
  dir: string;
  first: number;
  start: number;
  end: number;
}

export type QueueDragTarget = { kind: "file"; index: number } | { kind: "folder"; first: number };

export type QueueDisplayItem =
  | {
      kind: "folder";
      dir: string;
      first: number;
      count: number;
      remainingBytes: number;
      collapsed: boolean;
    }
  | { kind: "file"; index: number };
