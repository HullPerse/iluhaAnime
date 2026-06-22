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
  PictureInPicture2,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import type { VideoStreamInfo } from "@/types";
import Tracks from "./tracks.player";

function Controls({
  chapters,
  mediaPath,
  streams,
  videoEl,
  onAudioSwitch,
}: {
  chapters?: { start_time: number; end_time: number; title: string }[];
  mediaPath?: string;
  streams?: VideoStreamInfo[];
  videoEl?: HTMLVideoElement | null;
  onAudioSwitch?: (newSrc: string | null) => void;
}) {
  const [dragging, setDragging] = useState<boolean>(false);

  const time = usePlayer(selectTime);
  const playback = usePlayer(selectPlayback);
  const value = usePlayer(selectVolume);
  const textTrack = usePlayer(selectTextTrack);

  const paused = playback?.paused ?? true;
  const currentTime = time?.currentTime ?? 0;
  const duration = time?.duration ?? 0;
  const muted = value?.muted;

  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const volumeRestored = useRef(false);

  const setVolume = (e: number) => value?.setVolume(e);

  const seek = time?.seek;
  const chaptersCues = textTrack?.chaptersCues ?? [];
  const allChapters =
    chapters ??
    chaptersCues.map((c) => ({
      start_time: c.startTime,
      end_time: c.endTime,
      title: c.text,
    }));

  const currentChapterIndex = (() => {
    for (let i = allChapters.length - 1; i >= 0; i--) {
      if (allChapters[i].start_time <= currentTime) return i;
    }
    return -1;
  })();
  const hasPrevChapter = currentChapterIndex > 0;
  const hasNextChapter = currentChapterIndex < allChapters.length - 1;

  const handleForward = () => {
    if (allChapters.length > 0 && hasNextChapter) {
      seek?.(allChapters[currentChapterIndex + 1].start_time);
    } else {
      seek?.(Math.min(currentTime + 5, duration));
    }
  };
  const handleBackward = () => {
    if (allChapters.length > 0 && hasPrevChapter) {
      seek?.(allChapters[currentChapterIndex - 1].start_time);
    } else {
      seek?.(Math.max(currentTime - 5, 0));
    }
  };

  const getVolumeIcon = () => {
    const vol = value?.volume ?? 0;
    if (vol === 0 || muted) return <VolumeX />;
    if (vol <= 0.33) return <Volume className="ml-1" />;
    if (vol <= 0.66) return <Volume1 />;
    return <Volume2 />;
  };

  const handleVolume = (clientX: number) => {
    if (!volumeContainerRef.current || !value) return;

    const rect = volumeContainerRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (clientX - rect.left) / rect.width),
    );

    setVolume(percent);
    localStorage.setItem("volume", String(percent));
  };

  const handleMouseMove = (e: { clientX: number }) => {
    if (!dragging) return;
    handleVolume(e.clientX);
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  useEffect(() => {
    if (value && !volumeRestored.current) {
      const saved = localStorage.getItem("volume");
      if (saved !== null) {
        const v = parseFloat(saved);
        if (!isNaN(v) && value.volumeAvailability !== "unavailable") {
          setVolume(v);
        }
      }
      volumeRestored.current = true;
    }
  }, [value]);

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

  const displayVolume = Number(muted ? 0 : (value?.volume ?? 0));

  const isPlayerReady = value && typeof value.setVolume === "function";

  const [playbackRate, setPlaybackRate] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  useEffect(() => {
    if (videoEl) videoEl.playbackRate = playbackRate;
  }, [videoEl, playbackRate]);

  useEffect(() => {
    if (!speedOpen) return;
    const handler = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node))
        setSpeedOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [speedOpen]);

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

      {/* Speed */}
      <section className="flex h-6 border-r-2 border-muted gap-0.5 px-1 items-center">
        <div ref={speedRef} className="relative">
          <button
            className="h-5 text-[10px] windows95-font bg-primary windows95-border px-1 min-w-10 cursor-pointer"
            onClick={() => setSpeedOpen(!speedOpen)}
          >
            {playbackRate}x
          </button>
          {speedOpen && (
            <div className="absolute bottom-full left-0 mb-0.5 min-w-full windows95-border bg-primary z-50 shadow-lg">
              {SPEEDS.map((r) => (
                <button
                  key={r}
                  className={`block w-full text-left px-1 py-0.5 text-[10px] windows95-font whitespace-nowrap hover:bg-secondary hover:text-white ${playbackRate === r ? "bg-secondary text-white" : ""}`}
                  onClick={() => {
                    setPlaybackRate(r);
                    setSpeedOpen(false);
                  }}
                >
                  {r}x
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {mediaPath && streams && videoEl && (
        <Tracks
          audioStreams={streams.filter((s) => s.codec_type === "audio")}
          subtitleStreams={streams.filter((s) => s.codec_type === "subtitle")}
          mediaPath={mediaPath}
          videoEl={videoEl}
          onAudioSwitch={onAudioSwitch!}
        />
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
