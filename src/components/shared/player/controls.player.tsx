import { Button } from "@/components/ui/button.component";
import {
  selectPlayback,
  selectTime,
  selectVolume,
  usePlayer,
} from "@videojs/react";
import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MouseEvent, useState, useEffect, useRef } from "react";

function Controls() {
  const [dragging, setDragging] = useState<boolean>(false);

  const time = usePlayer(selectTime);
  const playback = usePlayer(selectPlayback);
  const paused = playback?.paused ?? true;
  const currentTime = time?.currentTime ?? 0;
  const duration = time?.duration ?? 0;

  //volume
  const value = usePlayer(selectVolume);
  const muted = value?.muted;

  const volumeContainerRef = useRef<HTMLDivElement>(null);

  const setVolume = (e: number) => value?.setVolume(e);

  const seek = time?.seek;

  const handleForward = () => seek?.(Math.min(currentTime + 5, duration));
  const handleBackward = () => seek?.(Math.max(currentTime - 5, 0));

  const getVolumeIcon = () => {
    const volume = value?.volume;

    if (!volume) return <VolumeX />;

    if (volume === 0 || muted) return <VolumeX />;
    else if (volume > 0 && volume <= 33) return <Volume className="ml-1" />;
    else if (volume > 33 && volume <= 66) return <Volume1 />;
    else if (volume > 66 && volume <= 100) return <Volume2 />;
  };

  const handleVolume = (clientX: number) => {
    if (!volumeContainerRef.current) return;

    const rect = volumeContainerRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );
    setVolume?.(percent);
  };

  const handleMouseMove = (e: MouseEvent | MouseEventInit) => {
    if (!dragging) return;
    if (e.clientX !== undefined) {
      handleVolume(e.clientX);
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

  const displayVolume = Number(muted ? 0 : value?.volume);

  return (
    <main className="flex flex-row items-center gap-1 p-1">
      <section className="flex h-6 w-15 border-r-2 border-muted gap-1">
        <Button
          size="icon"
          className="size-6"
          onClick={() => playback?.play()}
          disabled={!paused}
        >
          <Play />
        </Button>
        <Button
          size="icon"
          className="size-6"
          onClick={() => playback?.pause()}
          disabled={paused}
        >
          <Pause />
        </Button>
      </section>

      <section className="flex h-6 w-15 border-r-2 border-muted gap-1">
        <Button
          size="icon"
          className="size-6"
          onClick={handleBackward}
          disabled={currentTime === 0}
        >
          <ChevronsLeft />
        </Button>
        <Button
          size="icon"
          className="size-6"
          onClick={handleForward}
          disabled={currentTime === duration}
        >
          <ChevronsRight />
        </Button>
      </section>

      {/*VOLUME*/}
      <section className="flex flex-row ml-auto h-6 w-fit border-l-2 border-muted gap-1 px-1">
        <span className="windows95-text items-center flex">
          {Math.round(displayVolume * 100)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => value?.toggleMuted()}
        >
          {getVolumeIcon()}
        </Button>

        <div
          ref={volumeContainerRef}
          className="w-24 windows95-border bg-white relative cursor-pointer items-center justify-center"
          onClick={(e) => {
            e.preventDefault();
            handleVolume(e.clientX);
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
            handleVolume(e.clientX);
          }}
        >
          <div
            className="absolute inset-y-0 left-0 bg-highlight"
            style={{ width: `${displayVolume * 100}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-2 bg-primary windows95-active-border pointer-events-none"
            style={{
              left: `${displayVolume * 100}%`,
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </section>
    </main>
  );
}

export default Controls;
