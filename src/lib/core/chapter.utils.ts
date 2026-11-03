import type {
  ChapterJumpArgs,
  ChapterJumpDirection,
  ChapterJumpResult,
} from "@/types/core/chapter";

function currentChapterIndex(chapters: readonly { time: number }[], timePos: number): number {
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    if (chapters[index].time <= timePos) return index;
  }
  return -1;
}

export function resolveMediaJump({
  chapters,
  timePos,
  hasPrev,
  hasNext,
  direction,
}: {
  chapters: readonly { time: number }[];
  timePos: number;
  hasPrev: boolean;
  hasNext: boolean;
  direction: ChapterJumpDirection;
}):
  | { kind: "seek"; time: number }
  | { kind: "file" }
  | { kind: "boundary"; edge: "first" | "last" } {
  const index = currentChapterIndex(chapters, timePos);
  if (direction < 0) {
    if (chapters.length > 0 && index > 0) {
      return { kind: "seek", time: chapters[index - 1].time };
    }
    if (chapters.length > 0 && index < 0) {
      return { kind: "seek", time: chapters[0].time };
    }
    return hasPrev ? { kind: "file" } : { kind: "boundary", edge: "first" };
  }
  if (chapters.length > 0 && index < 0) {
    return { kind: "seek", time: chapters[0].time };
  }
  if (chapters.length > 0 && index < chapters.length - 1) {
    return { kind: "seek", time: chapters[index + 1].time };
  }
  return hasNext ? { kind: "file" } : { kind: "boundary", edge: "last" };
}

export function resolveChapterJump({
  chapters,
  timePos,
  duration,
  hasPrev,
  hasNext,
  direction,
  step,
}: ChapterJumpArgs): ChapterJumpResult {
  const index = currentChapterIndex(chapters, timePos);
  if (direction < 0) {
    if (chapters.length > 0 && index > 0) {
      return { kind: "seek", time: chapters[index - 1].time };
    }
    if (!hasPrev && chapters.length === 0) {
      return { kind: "seek", time: Math.max(timePos - step, 0) };
    }
    if (!hasPrev) return { kind: "boundary", edge: "first" };
    return { kind: "seek", time: Math.max(timePos - step, 0) };
  }
  if (chapters.length > 0 && index < chapters.length - 1) {
    return { kind: "seek", time: chapters[index + 1].time };
  }
  if (!hasNext && chapters.length === 0) {
    return { kind: "seek", time: Math.min(timePos + step, duration) };
  }
  if (!hasNext) return { kind: "boundary", edge: "last" };
  return { kind: "seek", time: Math.min(timePos + step, duration) };
}
