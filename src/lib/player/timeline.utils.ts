import { formatClock } from "@/lib/core/time.utils";
import type { TFunc } from "@/types/core/i18n";
import type { MpvChapter } from "@/types/player/videoPlayer";

export const TOOLTIP_WIDTH = 128;
export const LIVE_SCRUB_INTERVAL = 80;
export const CHAPTER_SNAP_SECONDS = 20;

export type HoverInfo = { time: number; x: number; chapter?: string };

/** A span of media mpv can reach without a new network request. */
export type BufferedSpan = { start: number; end: number };

const SPAN_EPSILON = 0.05;
const SPAN_TOLERANCE = 0.5;

/**
 * The buffered span around the playhead.
 *
 * mpv reports the start and the end of the demuxer cache separately, and the
 * start sits behind the playhead once the back buffer holds data. When mpv does
 * not report the timestamps, the observed cache duration is used ahead of the
 * playhead. Anything that would paint nothing is dropped.
 */
export function bufferedSpan(
  timePos: number,
  duration: number,
  cacheStart: number | undefined,
  cacheEnd: number | undefined,
  cacheDuration: number | undefined
): BufferedSpan | null {
  if (!(duration > 0)) return null;
  const start = clamp01((cacheStart ?? timePos) / duration) * duration;
  const end = clamp01((cacheEnd ?? timePos + (cacheDuration ?? 0)) / duration) * duration;
  if (!(end - start > SPAN_EPSILON)) return null;
  return { start, end };
}

/**
 * The tooltip line for a stream: where the loaded span ends, or a warning that
 * the seek under the cursor has to fetch first. `null` for a local file, where
 * there is nothing to say.
 */
export function bufferedHintText(
  translate: TFunc,
  span: BufferedSpan | null,
  hoverTime: number | undefined,
  streaming: boolean
): string | null {
  if (!streaming || hoverTime === undefined) return null;
  if (span !== null && isBuffered(span, hoverTime)) {
    return translate("player.media.timeline.buffered.to", { time: formatClock(span.end) });
  }
  return translate("player.media.timeline.buffered.pending");
}

/** Whether a seek to `time` stays inside the loaded span. */
export function isBuffered(span: BufferedSpan | null, time: number): boolean {
  if (span === null) return false;
  return time >= span.start - SPAN_TOLERANCE && time <= span.end + SPAN_TOLERANCE;
}

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
