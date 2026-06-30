import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatTime } from "@/lib/index.utils";
import {
  selectBuffer,
  selectTextTrack,
  selectTime,
  usePlayer,
} from "@videojs/react";
import { useState, useEffect, useRef } from "react";
import { THUMB_INTERVAL } from "@/config/player.config";

function Timeline({
  chapters,
  mediaPath,
}: {
  chapters?: { start_time: number; end_time: number; title: string }[];
  mediaPath?: string;
}) {
  const [dragging, setDragging] = useState<boolean>(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    time: number;
    rawX: number;
    chapterTitle?: string;
  } | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [tipWidth, setTipWidth] = useState<number>(200);
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
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!mediaPath) {
      setThumbs([]);
      return;
    }
    let cancelled = false;
    invoke<string[]>("generate_thumbnails", {
      videoPath: mediaPath,
      interval: THUMB_INTERVAL,
    })
      .then((paths) => {
        if (!cancelled) setThumbs(paths);
      })
      .catch(() => {
        if (!cancelled) setThumbs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaPath]);

  const thumbIndex =
    hoverInfo && thumbs.length > 0
      ? Math.min(Math.floor(hoverInfo.time / THUMB_INTERVAL), thumbs.length - 1)
      : -1;
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

  const hoverX =
    hoverInfo && timelineRef.current
      ? (() => {
          const parent = timelineRef.current.parentElement;
          const wrapperW =
            parent?.offsetWidth ?? timelineRef.current.offsetWidth;
          const half = tipWidth / 2;
          return Math.max(half, Math.min(wrapperW - half, hoverInfo.rawX));
        })()
      : 0;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const t = pct * duration;
    if (dragging) paintScrub(e.clientX);
    setHoverInfo({
      time: t,
      rawX: e.clientX - rect.left,
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
            ref={(el) => {
              tooltipRef.current = el;
              if (el && el.offsetWidth !== tipWidth)
                setTipWidth(el.offsetWidth);
            }}
            className="absolute bottom-full mb-1 z-50 select-text"
            style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}
          >
            <div className="flex flex-col windows95-border bg-primary px-1 py-0.5 windows95-text whitespace-nowrap min-w-32 w-32 max-w-32 items-center">
              {thumbIndex >= 0 && (
                <div className="mb-0.5">
                  <img
                    key={thumbIndex}
                    src={convertFileSrc(thumbs[thumbIndex])}
                    className={`w-32 max-32 min-32 h-18 min-h-18 max-h-18 border border-black/20 ${imgLoaded ? "" : "hidden"}`}
                    alt="Thumbnail"
                    onLoad={() => setImgLoaded(true)}
                    onError={() => setImgLoaded(false)}
                  />
                </div>
              )}
              <span className="tabular-nums">
                {formatTime(hoverInfo.time)}
                {hoverInfo.chapterTitle ? `(${hoverInfo.chapterTitle})` : null}
              </span>
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
