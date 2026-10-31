import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { formatClock } from "@/lib/core/time.utils";
import {
  TOOLTIP_WIDTH,
  LIVE_SCRUB_INTERVAL,
  type HoverInfo,
  clamp01,
  chapterTitleAt,
  nearestChapterEdge,
} from "@/lib/player/timeline.utils";
import { playbackAtoms } from "@/store/player.store";
import type { MpvChapter } from "@/types/player/videoPlayer";

function Timeline({
  duration,
  chapters,
  seekTarget,
  onScrub,
  onCommitSeek,
}: {
  duration: number;
  chapters: MpvChapter[];
  seekTarget: number | null;
  onScrub: (time: number) => void;
  onCommitSeek: (time: number) => void;
}) {
  const timePos = useCell(playbackAtoms.timePos);
  // Seconds mpv already holds ahead of the playhead. A seek inside that span
  // does not touch the network, so it is drawn as its own segment: the bar
  // answers "how far can I jump without buffering" before the click.
  const cacheDuration = useCell(playbackAtoms.cacheDuration);
  const { t } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);

  const displayTime = dragging && scrubTime !== null ? scrubTime : (seekTarget ?? timePos);
  const progress = duration > 0 ? clamp01(displayTime / duration) * 100 : 0;
  const bufferedFrom = duration > 0 ? clamp01(timePos / duration) * 100 : 0;
  const bufferedTo =
    duration > 0 && cacheDuration !== undefined && cacheDuration > 0
      ? clamp01((timePos + cacheDuration) / duration) * 100
      : bufferedFrom;
  // The buffered span is drawn only while the bar is being pointed at: a bar
  // at rest already carries the chapter ticks, and a second filled segment
  // underneath them reads as one more chapter rather than as the cache.
  const showBuffered = hover !== null || dragging;
  const showRemainingTime = showRemaining && duration > 0;
  const timeWidth = `${formatClock(duration).length * 2 + 4}ch`;
  const timeLabel = showRemainingTime
    ? `-${formatClock(Math.max(0, duration - displayTime))}`
    : `${formatClock(displayTime)} / ${formatClock(duration)}`;
  const toggleLabel = t("player.media.timeline.toggle");

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const element = barRef.current;
      if (!element || duration <= 0) return 0;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return clamp01((clientX - rect.left) / rect.width) * duration;
    },
    [duration]
  );

  const describeHover = useCallback(
    (clientX: number, time: number): void => {
      const element = barRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const half = TOOLTIP_WIDTH / 2;
      setHover({
        time,
        x: Math.max(half, Math.min(rect.width - half, clientX - rect.left)),
        chapter: chapterTitleAt(chapters, time, duration),
      });
    },
    [chapters, duration]
  );

  useEffect(() => {
    if (!dragging) return;
    let lastScrub = 0;
    const onMove = (event: MouseEvent) => {
      const rawTime = timeFromClientX(event.clientX);
      const time = event.ctrlKey
        ? (nearestChapterEdge(chapters, duration, rawTime) ?? rawTime)
        : rawTime;
      setScrubTime(time);
      describeHover(event.clientX, time);
      const now = Date.now();
      if (now - lastScrub >= LIVE_SCRUB_INTERVAL) {
        lastScrub = now;
        onScrub(time);
      }
    };
    const onUp = (event: MouseEvent) => {
      setDragging(false);
      setScrubTime(null);
      const rawTime = timeFromClientX(event.clientX);
      const commitTime = event.ctrlKey
        ? (nearestChapterEdge(chapters, duration, rawTime) ?? rawTime)
        : rawTime;
      onCommitSeek(commitTime);
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, describeHover, onCommitSeek, onScrub, timeFromClientX, chapters, duration]);

  const handleBarDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
    const rawTime = timeFromClientX(event.clientX);
    const time = event.ctrlKey
      ? (nearestChapterEdge(chapters, duration, rawTime) ?? rawTime)
      : rawTime;
    setScrubTime(time);
    describeHover(event.clientX, time);
  };

  const handleBarMove = (event: React.MouseEvent<HTMLDivElement>) => {
    describeHover(event.clientX, timeFromClientX(event.clientX));
  };

  return (
    <main className="flex flex-row items-center gap-1 p-1">
      <button
        type="button"
        style={{ width: timeWidth }}
        className="windows95-text focus-visible:outline-text shrink-0 cursor-pointer bg-transparent text-right whitespace-nowrap tabular-nums focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        title={toggleLabel}
        aria-label={toggleLabel}
        aria-pressed={showRemaining}
        onClick={() => setShowRemaining((value) => !value)}
      >
        {timeLabel}
      </button>
      <div className="relative flex-1">
        {hover && (
          <div
            className="pointer-events-none absolute bottom-full z-50 mb-1 select-text"
            style={{ left: `${hover.x}px`, transform: "translateX(-50%)" }}
          >
            <div className="windows95-border bg-primary windows95-text text-text flex w-max max-w-56 min-w-32 flex-col items-center gap-px px-1.5 py-0.5">
              {hover.chapter && (
                <span
                  className="text-text w-full truncate text-center text-xs font-bold whitespace-nowrap"
                  title={hover.chapter}
                >
                  {hover.chapter}
                </span>
              )}
              <span className="tabular-nums">{formatClock(hover.time)}</span>
            </div>
          </div>
        )}
        <div
          ref={barRef}
          className="windows95-border relative h-4 cursor-pointer bg-white"
          onMouseDown={handleBarDown}
          onMouseMove={handleBarMove}
          onMouseLeave={() => setHover(null)}
        >
          {showBuffered && (
            <div
              data-testid="timeline-buffered"
              className="bg-muted-trans pointer-events-none absolute inset-y-0"
              style={{ left: `${bufferedFrom}%`, width: `${bufferedTo - bufferedFrom}%` }}
            />
          )}
          <div
            className="bg-secondary absolute inset-y-0 left-0"
            style={{ width: `${progress}%` }}
          />
          {duration > 0 &&
            chapters.map((chapter, index) =>
              index === 0 ? null : (
                <div
                  key={`${chapter.time}-${index}`}
                  className="bg-muted absolute top-0 bottom-0 w-0.5"
                  style={{
                    left: `${clamp01(chapter.time / duration) * 100}%`,
                    transform: "translateX(-50%)",
                  }}
                />
              )
            )}
          <div
            className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
            style={{ left: `${progress}%`, transform: "translateX(-50%)" }}
          />
        </div>
      </div>
    </main>
  );
}

export default Timeline;
