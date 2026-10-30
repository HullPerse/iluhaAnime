import type { MpvChapter } from "@/types/player/videoPlayer";

export const TOOLTIP_WIDTH = 128;
export const LIVE_SCRUB_INTERVAL = 80;
export const CHAPTER_SNAP_SECONDS = 20;

export type HoverInfo = { time: number; x: number; chapter?: string };

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function chapterTitleAt(
  chapters: MpvChapter[],
  time: number,
  duration: number
): string | undefined {
  for (let index = 0; index < chapters.length; index += 1) {
    const start = chapters[index].time;
    const end = chapters[index].end ?? chapters[index + 1]?.time ?? duration;
    if (time >= start && time < end) {
      return chapters[index].title;
    }
  }
  return undefined;
}

export function nearestChapterEdge(
  chapters: MpvChapter[],
  duration: number,
  time: number
): number | null {
  let nearest: number | null = null;
  let nearestDist = Infinity;
  for (const chapter of chapters) {
    const candidates = [chapter.time, chapter.end ?? duration];
    for (const candidate of candidates) {
      const dist = Math.abs(candidate - time);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }
  }
  if (nearest === null || nearestDist > CHAPTER_SNAP_SECONDS) return null;
  return nearest;
}
