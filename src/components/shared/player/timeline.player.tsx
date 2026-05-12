import { formatTime } from "@/lib/utils";
import { selectBuffer, selectTime, usePlayer } from "@videojs/react";
import { MouseEvent, useState, useEffect, useRef } from "react";

function Timeline() {
  const [dragging, setDragging] = useState<boolean>(false);

  const time = usePlayer(selectTime);
  const buffer = usePlayer(selectBuffer);

  const currentTime = time?.currentTime ?? 0;
  const duration = time?.duration ?? 0;
  const buffered = buffer?.buffered ?? [];
  const seek = time?.seek;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedEnd =
    buffered.length > 0 && duration > 0
      ? Math.min(100, (buffered[buffered.length - 1][1] / duration) * 100)
      : 0;

  const timelineContainerRef = useRef<HTMLElement>(null);

  const handleSeek = (clientX: number) => {
    if (!seek || !timelineContainerRef.current) return;

    const rect = timelineContainerRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );

    return seek(percent * duration);
  };

  const handleMouseMove = (e: MouseEvent | MouseEventInit) => {
    if (!dragging) return;
    if (e.clientX !== undefined) {
      handleSeek(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  useEffect(() => {
    if (dragging) {
      document.body.style.userSelect = "none";

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);

        document.body.style.userSelect = "";
      };
    }
  }, [dragging]);

  return (
    <main className="flex flex-row items-center gap-1 p-1">
      <span className="flex flex-row windows95-text text-[10px] w-16 max-w-16 min-w-16 text-right tabular-nums">{`${formatTime(currentTime)} / ${formatTime(duration)}`}</span>
      <section
        ref={timelineContainerRef}
        className="flex-1 h-4 windows95-border bg-white relative cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          handleSeek(e.clientX);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
          handleSeek(e.clientX);
        }}
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
      </section>
    </main>
  );
}

export default Timeline;
