export type ChapterJumpDirection = -1 | 1;

export type ChapterJumpResult =
  | { kind: "seek"; time: number }
  | { kind: "boundary"; edge: "first" | "last" };

export interface ChapterJumpArgs {
  chapters: readonly { time: number }[];
  timePos: number;
  duration: number;
  hasPrev: boolean;
  hasNext: boolean;
  direction: ChapterJumpDirection;
  step: number;
}
