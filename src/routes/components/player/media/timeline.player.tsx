import { useCallback, useEffect, useRef, useState } from "react";

import { attempt } from "@/lib/utils/attempt.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { formatClock } from "@/lib/utils/time.utils";
import { usePlaybackStore } from "@/store/player.store";
import type { MpvChapter } from "@/types/videoPlayer";

const TOOLTIP_WIDTH = 128;
const LIVE_SCRUB_INTERVAL = 80;
const HOVER_THUMB_DEBOUNCE = 200;
const HOVER_FILL_STEP = 10;
const HOVER_FILL_INTERVAL = 900;

interface HoverThumbResponse {
  url: string | null;
  captured: boolean;
}

function useHoverThumb(
  path: string,
  duration: number,
  paused: boolean,
  hoverTime: number | null
): string | null {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const requestedRef = useRef<number | null>(null);

  useEffect(() => {
    requestedRef.current = null;
    setThumbUrl(null);
    if (hoverTime === null || !path || duration <= 0) {
      return;
    }
    const target = hoverTime;
    requestedRef.current = target;
    const timer = window.setTimeout(() => {
      attempt(
        invokeTyped<HoverThumbResponse>("player_hover_thumb", { path, timestamp: target })
      ).then(([res]) => {
        if (requestedRef.current !== target) return;
        setThumbUrl(res?.url ? assetUrl(res.url) : null);
      });
    }, HOVER_THUMB_DEBOUNCE);
    return () => window.clearTimeout(timer);
  }, [hoverTime, path, duration]);

  const fillCursor = useRef(0);

  useEffect(() => {
    fillCursor.current = 0;
    if (!paused || !path || duration <= 0) return;
    const timer = window.setInterval(() => {
      const target = (fillCursor.current * HOVER_FILL_STEP) % Math.max(duration, HOVER_FILL_STEP);
      fillCursor.current += 1;
      ignore(invokeTyped("player_hover_thumb", { path, timestamp: target }));
    }, HOVER_FILL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [paused, path, duration]);

  return thumbUrl;
}

type HoverInfo = { time: number; x: number; chapter?: string };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function chapterTitleAt(
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
  const timePos = usePlaybackStore((state) => state.timePos);
  const path = usePlaybackStore((state) => state.path);
  const paused = usePlaybackStore((state) => state.paused);
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);
  const thumbUrl = useHoverThumb(path, duration, paused, hover?.time ?? null);

  const displayTime = dragging && scrubTime !== null ? scrubTime : (seekTarget ?? timePos);
  const progress = duration > 0 ? clamp01(displayTime / duration) * 100 : 0;
  const timeWidth = `${formatClock(duration).length * 2 + 3}ch`;
  const timeLabel = showRemaining
    ? `-${formatClock(Math.max(0, duration - displayTime))} / ${formatClock(duration)}`
    : `${formatClock(displayTime)} / ${formatClock(duration)}`;

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
      const time = timeFromClientX(event.clientX);
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
      onCommitSeek(timeFromClientX(event.clientX));
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, describeHover, onCommitSeek, onScrub, timeFromClientX]);

  const handleBarDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
    const time = timeFromClientX(event.clientX);
    setScrubTime(time);
    describeHover(event.clientX, time);
  };

  const handleBarMove = (event: React.MouseEvent<HTMLDivElement>) => {
    describeHover(event.clientX, timeFromClientX(event.clientX));
  };

  return (
    <main className="flex flex-row items-center gap-1 p-1">
      <span
        style={{ width: timeWidth }}
        className="windows95-text shrink-0 cursor-pointer text-right whitespace-nowrap tabular-nums"
        title={showRemaining ? formatClock(displayTime) : undefined}
        onClick={() => setShowRemaining((value) => !value)}
      >
        {timeLabel}
      </span>
      <div className="relative flex-1">
        {hover ? (
          <div
            className="pointer-events-none absolute bottom-full z-50 mb-1 select-text"
            style={{ left: `${hover.x}px`, transform: "translateX(-50%)" }}
          >
            <div className="windows95-border bg-primary windows95-text text-text flex w-max max-w-56 min-w-32 flex-col items-center gap-px px-1.5 py-0.5">
              {thumbUrl ? (
                <img src={thumbUrl} alt="" className="h-auto w-32" draggable={false} />
              ) : null}
              {hover.chapter ? (
                <span
                  className="text-text w-full truncate text-center text-xs font-bold whitespace-nowrap"
                  title={hover.chapter}
                >
                  {hover.chapter}
                </span>
              ) : null}
              <span className="tabular-nums">{formatClock(hover.time)}</span>
            </div>
          </div>
        ) : null}
        <div
          ref={barRef}
          className="windows95-border relative h-4 cursor-pointer bg-white"
          onMouseDown={handleBarDown}
          onMouseMove={handleBarMove}
          onMouseLeave={() => setHover(null)}
        >
          <div
            className="bg-secondary absolute inset-y-0 left-0"
            style={{ width: `${progress}%` }}
          />
          {duration > 0
            ? chapters.map((chapter, index) =>
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
              )
            : null}
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
