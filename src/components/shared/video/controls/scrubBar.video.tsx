import { selectBuffer, selectTime } from "@videojs/core/dom";
import { usePlayer } from "@videojs/react";
import { useCallback, useRef, useState } from "react";

import { useWindowDrag } from "@/hooks/windowDrag.hook";
import { formatClock } from "@/lib/utils/time.utils";

export function ScrubBar() {
  const time = usePlayer(selectTime);
  const buffer = usePlayer(selectBuffer);
  const barRef = useRef<HTMLDivElement>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const duration = time?.duration ?? 0;
  const display = scrubTime ?? time?.currentTime ?? 0;
  const progress = duration > 0 ? (display / duration) * 100 : 0;
  const buffered = buffer?.buffered ?? [];
  const bufferedEnd =
    buffered.length > 0 && duration > 0
      ? Math.min(100, ((buffered.at(-1)?.[1] ?? 0) / duration) * 100)
      : 0;

  const seekToTime = useCallback(
    (target: number) => {
      if (duration <= 0) return;
      const clamped = Math.max(0, Math.min(duration, target));
      setScrubTime(clamped);
      time?.seek(clamped);
    },
    [time, duration]
  );

  const seekAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      seekToTime(((clientX - rect.left) / rect.width) * duration);
    },
    [seekToTime, duration]
  );

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const t = ((clientX - rect.left) / rect.width) * duration;
      return Math.max(0, Math.min(duration, t));
    },
    [duration]
  );

  const { setDragging } = useWindowDrag(seekAt);

  return (
    <div
      ref={barRef}
      className="windows95-border bg-field relative h-4 min-w-0 flex-1 cursor-pointer"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuenow={Math.round(display)}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      onMouseDown={(event) => {
        event.preventDefault();
        setDragging(true);
        seekAt(event.clientX);
      }}
      onMouseMove={(event) => {
        const t = timeAt(event.clientX);
        setHoverTime(t);
        const rect = barRef.current?.getBoundingClientRect();
        if (rect) setHoverX(event.clientX - rect.left);
      }}
      onMouseLeave={() => setHoverTime(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") seekToTime(display + 5);
        if (event.key === "ArrowLeft") seekToTime(display - 5);
      }}
    >
      {hoverTime !== null && duration > 0 && (
        <div
          className="windows95-border bg-primary windows95-text pointer-events-none absolute bottom-full z-10 mb-1 px-1 py-0.5 whitespace-nowrap"
          style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}
        >
          {formatClock(hoverTime)}
        </div>
      )}
      <div className="bg-muted/30 absolute inset-y-0 left-0" style={{ width: `${bufferedEnd}%` }} />
      <div
        className="bg-highlight absolute inset-y-0 left-0 transition-none"
        style={{ width: `${progress}%` }}
      />
      <div
        className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
        style={{ left: `${progress}%`, transform: "translateX(-50%)" }}
      />
    </div>
  );
}
