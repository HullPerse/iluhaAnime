import { selectVolume } from "@videojs/core/dom";
import { usePlayer } from "@videojs/react";
import { useCallback, useRef, useState } from "react";

import { VOLUME_STEP } from "@/config/player/video.config";
import { useWindowDrag } from "@/hooks/windowDrag.hook";

export function VolumeBar() {
  const volume = usePlayer(selectVolume);
  const barRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const level = volume?.muted ? 0 : (volume?.volume ?? 1);
  const percent = Math.round(level * 100);

  const setAt = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      volume?.setVolume(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
    },
    [volume]
  );

  const step = useCallback(
    (delta: number) => {
      if (!volume) return;
      volume.setVolume(Math.max(0, Math.min(1, (volume.volume ?? 1) + delta)));
    },
    [volume]
  );

  const { dragging, setDragging } = useWindowDrag(setAt);

  return (
    <div
      ref={barRef}
      className="windows95-border relative h-4 w-20 shrink-0 cursor-pointer bg-white"
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      onMouseDown={(event) => {
        event.preventDefault();
        setDragging(true);
        setAt(event.clientX);
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onWheel={(event) => {
        event.preventDefault();
        step(event.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") step(VOLUME_STEP);
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") step(-VOLUME_STEP);
      }}
    >
      {(hovering || dragging) && (
        <div className="windows95-border bg-primary windows95-text pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 px-1 py-0.5 whitespace-nowrap">
          {percent}%
        </div>
      )}
      <div
        className="bg-highlight absolute inset-y-0 left-0 transition-none"
        style={{ width: `${level * 100}%` }}
      />
      <div
        className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
        style={{ left: `${level * 100}%`, transform: "translateX(-50%)" }}
      />
    </div>
  );
}
