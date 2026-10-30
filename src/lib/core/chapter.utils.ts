import type { ChapterJumpArgs, ChapterJumpResult } from "@/types/core/chapter";

function currentChapterIndex(chapters: readonly { time: number }[], timePos: number): number {
  for (let index = chapters.length - 1; index >= 0; index -= 1) {
    if (chapters[index].time <= timePos) return index;
  }
  return -1;
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
