import { Button } from "@/components/ui/button.component";
import {
  selectPlayback,
  selectTextTrack,
  selectTime,
  selectVolume,
  usePlayer,
} from "@videojs/react";
import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MouseEvent, useState, useEffect, useRef } from "react";

function Controls({
  chapters,
}: {
  chapters?: { start_time: number; end_time: number; title: string }[];
}) {
  const [dragging, setDragging] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  const time = usePlayer(selectTime);
  const playback = usePlayer(selectPlayback);
  const value = usePlayer(selectVolume);
  const textTrack = usePlayer(selectTextTrack);

  const paused = playback?.paused ?? true;
  const currentTime = time?.currentTime ?? 0;
  const duration = time?.duration ?? 0;
  const muted = value?.muted;

  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const volumeSetRef = useRef<number>(0);

  const setVolume = (e: number) => value?.setVolume(e);

  const seek = time?.seek;
  const chaptersCues = textTrack?.chaptersCues ?? [];
  const allChapters = chapters ?? chaptersCues.map((c) => ({
    start_time: c.startTime,
    end_time: c.endTime,
    title: c.text,
  }));

  const handleForward = () => seek?.(Math.min(currentTime + 5, duration));
  const handleBackward = () => seek?.(Math.max(currentTime - 5, 0));

  const currentChapterIndex = (() => {
    for (let i = allChapters.length - 1; i >= 0; i--) {
      if (allChapters[i].start_time <= currentTime) return i;
    }
    return -1;
  })();
  const hasPrevChapter = currentChapterIndex > 0;
  const hasNextChapter = currentChapterIndex < allChapters.length - 1;

  const handlePrevChapter = () => {
    if (!hasPrevChapter || !seek) return;
    seek(allChapters[currentChapterIndex - 1].start_time);
  };
  const handleNextChapter = () => {
    if (!hasNextChapter || !seek) return;
    seek(allChapters[currentChapterIndex + 1].start_time);
  };

  const getVolumeIcon = () => {
    const volume = value?.volume;

    if (!volume && volume !== 0) return <VolumeX />;

    if (volume === 0 || muted) return <VolumeX />;
    else if (volume > 0 && volume <= 0.33) return <Volume className="ml-1" />;
    else if (volume > 0.33 && volume <= 0.66) return <Volume1 />;
    else if (volume > 0.66 && volume <= 1) return <Volume2 />;

    return <VolumeX />;
  };

  const handleVolume = (clientX: number) => {
    if (!volumeContainerRef.current || !value) return;

    const rect = volumeContainerRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );

    setVolume(percent);

    if (volumeSetRef.current) {
      clearTimeout(volumeSetRef.current);
    }

    volumeSetRef.current = setTimeout(() => {
      localStorage.setItem("volume", String(percent));
    }, 300);
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
    if (value && !mounted) {
      const savedVolume = localStorage.getItem("volume");
      if (savedVolume !== null) {
        const volumeValue = parseFloat(savedVolume);
        if (typeof volumeValue === "number" && !isNaN(volumeValue)) {
          if (value.volumeAvailability === "unavailable") return;
          setVolume(volumeValue);
        }
      }

      setMounted(true);
    }
  }, [value, mounted]);

  useEffect(() => {
    if (mounted && !dragging) {
      if (!value) return;
      else localStorage.setItem("volume", String(value.volume));
    }
  }, [value?.volume, mounted, dragging]);

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

  useEffect(() => {
    return () => {
      if (volumeSetRef.current) {
        clearTimeout(volumeSetRef.current);
      }
    };
  }, []);

  const displayVolume = Number(muted ? 0 : (value?.volume ?? 0));

  // Don't render volume controls until player is ready
  const isPlayerReady = value && typeof value.setVolume === "function";

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

      {allChapters.length > 0 && (
        <section className="flex h-6 w-15 border-r-2 border-muted gap-1">
          <Button
            size="icon"
            className="size-6"
            onClick={handlePrevChapter}
            disabled={!hasPrevChapter}
            title="Previous chapter"
          >
            <SkipBack />
          </Button>
          <Button
            size="icon"
            className="size-6"
            onClick={handleNextChapter}
            disabled={!hasNextChapter}
            title="Next chapter"
          >
            <SkipForward />
          </Button>
        </section>
      )}

      {/*VOLUME*/}
      <section className="flex flex-row ml-auto h-6 w-fit border-l-2 border-muted gap-1 px-1">
        <span className="windows95-text items-center flex">
          {Math.round(displayVolume * 100)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => {
            if (value?.toggleMuted) {
              value.toggleMuted();
            }
          }}
          disabled={!isPlayerReady}
        >
          {getVolumeIcon()}
        </Button>

        <div
          ref={volumeContainerRef}
          className="w-24 windows95-border bg-white relative cursor-pointer items-center justify-center"
          onClick={(e) => {
            if (!isPlayerReady) return;
            e.preventDefault();
            handleVolume(e.clientX);
          }}
          onMouseDown={(e) => {
            if (!isPlayerReady) return;
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
