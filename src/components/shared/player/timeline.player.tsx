import { formatTime } from "@/lib/index.utils";
import {
  selectBuffer,
  selectTextTrack,
  selectTime,
  usePlayer,
} from "@videojs/react";
import { useState, useEffect, useRef } from "react";

function Timeline({
  chapters,
}: {
  chapters?: { start_time: number; end_time: number; title: string }[];
}) {
  const [dragging, setDragging] = useState<boolean>(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    time: number;
    x: number;
    chapterTitle?: string;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const time = usePlayer(selectTime);
  const buffer = usePlayer(selectBuffer);
  const textTrack = usePlayer(selectTextTrack);

  const currentTime = time?.currentTime ?? 0;
  const duration = time?.duration ?? 0;
  const buffered = buffer?.buffered ?? [];
  const seek = time?.seek;
  const chaptersCues = textTrack?.chaptersCues ?? [];
  const allChapters =
    chapters ??
    chaptersCues.map((c) => ({
      start_time: c.startTime,
      end_time: c.endTime,
      title: c.text,
    }));

  const displayTime = dragging && scrubTime !== null ? scrubTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const bufferedEnd =
    buffered.length > 0 && duration > 0
      ? Math.min(100, (buffered[buffered.length - 1][1] / duration) * 100)
      : 0;

  const timelineRef = useRef<HTMLElement>(null);
  const seekThrottleRef = useRef<number | null>(null);
  const dragTargetRef = useRef(0);

  const paintScrub = (clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = pct * duration;
    dragTargetRef.current = t;
    setScrubTime(t);
  };

  const commitSeek = () => {
    if (seek && duration > 0) {
      seek(dragTargetRef.current);
    }
  };

  const handleSeek = (clientX: number) => {
    if (!seek || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(pct * duration);
  };

  const getChapterAtTime = (t: number) => {
    for (let i = allChapters.length - 1; i >= 0; i--) {
      if (allChapters[i].start_time <= t && t < allChapters[i].end_time)
        return allChapters[i].title;
    }
    return undefined;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * duration;
    if (dragging) paintScrub(e.clientX);
    const wrapperW =
      timelineRef.current.parentElement?.offsetWidth ?? rect.width;
    const tipW = tooltipRef.current?.offsetWidth ?? 160;
    const half = tipW / 2;
    const x = Math.max(half, Math.min(wrapperW - half, e.clientX - rect.left));
    setHoverInfo({
      time: t,
      x,
      chapterTitle: getChapterAtTime(t),
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  const handleWindowMouseMove = (e: globalThis.MouseEvent) => {
    paintScrub(e.clientX);
    if (seekThrottleRef.current === null) {
      seekThrottleRef.current = window.setTimeout(() => {
        seekThrottleRef.current = null;
        commitSeek();
      }, 80);
    }
  };

  const handleMouseUp = () => {
    if (seekThrottleRef.current) clearTimeout(seekThrottleRef.current);

    seekThrottleRef.current = null;
    commitSeek();
    setDragging(false);
    setScrubTime(null);
  };

  useEffect(() => {
    if (dragging) {
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleWindowMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
      };
    }
  }, [dragging]);

  return (
    <main className="flex flex-row items-center gap-1 p-1">
      <span className="flex flex-row windows95-text w-18max-w-18 min-w-18 text-right tabular-nums">
        {`${formatTime(displayTime)} / ${formatTime(duration)}`}
      </span>
      <div className="flex-1 relative">
        {hoverInfo && (
          <div
            ref={tooltipRef}
            className="absolute bottom-full mb-1 z-50 select-text"
            style={{ left: `${hoverInfo.x}px`, transform: "translateX(-50%)" }}
          >
            <div className="windows95-border bg-primary px-1 py-0.5 text-[10px] windows95-font whitespace-nowrap min-w-16 text-center">
              <span className="tabular-nums">{formatTime(hoverInfo.time)}</span>
              {hoverInfo.chapterTitle && (
                <span className="ml-1 text-white/60">
                  - {hoverInfo.chapterTitle}
                </span>
              )}
            </div>
          </div>
        )}
        <section
          ref={timelineRef}
          className="h-4 windows95-border bg-white relative cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            handleSeek(e.clientX);
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
            paintScrub(e.clientX);
            commitSeek();
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="absolute inset-y-0 left-0 bg-muted/30"
            style={{ width: `${bufferedEnd}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-highlight transition-none"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-2 bg-primary windows95-active-border pointer-events-none"
            style={{ left: `${progress}%`, transform: "translateX(-50%)" }}
          />

          {allChapters.map((ch) => {
            const pos = duration > 0 ? (ch.start_time / duration) * 100 : 0;
            if (pos <= 0 || pos >= 100) return null;
            return (
              <div
                key={ch.start_time}
                className="absolute top-0 bottom-0 w-0.5 pointer-events-none bg-muted"
                style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                title={ch.title}
              />
            );
          })}
        </section>
      </div>
    </main>
  );
}

export default Timeline;
