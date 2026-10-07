import { cn } from "cn";
import {
  ChevronsLeft,
  ChevronsRight,
  ListVideo,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  SquareX,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { SEEK_STEP } from "@/config/player/keybinds.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { playbackAtoms } from "@/store/player.store";
import type { MpvChapter, MpvTrack } from "@/types/videoPlayer";

import Tracks from "./tracks.player";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const BOUNDARY_TIMEOUT = 2000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function Controls({
  paused,
  duration,
  chapters,
  tracks,
  hasPrev,
  hasNext,
  immersive,
  autoHide,
  speed,
  volume,
  muted,
  playlistOpen,
  onPlay,
  onPause,
  onSeekTo,
  onFilePrev,
  onFileNext,
  onSpeed,
  onVolume,
  onMute,
  onToggleAutoHide,
  onTogglePlaylist,
  onSelectAudio,
  onSelectSub,
  onAddAudio,
  onAddSubtitle,
}: {
  paused: boolean;
  duration: number;
  chapters: MpvChapter[];
  tracks: MpvTrack[];
  hasPrev: boolean;
  hasNext: boolean;
  immersive: boolean;
  autoHide: boolean;
  speed: number;
  volume: number;
  muted: boolean;
  playlistOpen: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeekTo: (seconds: number) => void;
  onFilePrev: () => void;
  onFileNext: () => void;
  onSpeed: (speed: number) => void;
  onVolume: (volume: number) => void;
  onMute: () => void;
  onToggleAutoHide: () => void;
  onTogglePlaylist: () => void;
  onSelectAudio: (id: number | "no") => void;
  onSelectSub: (id: number | "no") => void;
  onAddAudio: () => void;
  onAddSubtitle: () => void;
}) {
  const { t } = useI18n();
  const timePos = useCell(playbackAtoms.timePos);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [boundary, setBoundary] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!speedOpen) return;
    const onDown = (event: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(event.target as Node)) {
        setSpeedOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [speedOpen]);

  useEffect(() => {
    if (!boundary) return;
    const id = window.setTimeout(() => setBoundary(null), BOUNDARY_TIMEOUT);
    return () => window.clearTimeout(id);
  }, [boundary]);

  const handleVolume = useCallback(
    (clientX: number) => {
      const element = volumeRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return;
      onVolume(clamp01((clientX - rect.left) / rect.width));
    },
    [onVolume]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => handleVolume(event.clientX);
    const onUp = () => setDragging(false);
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, handleVolume]);

  const showBoundaryMsg = (message: string) => {
    setBoundary(message);
  };

  const currentChapterIndex = (() => {
    for (let index = chapters.length - 1; index >= 0; index -= 1) {
      if (chapters[index].time <= timePos) {
        return index;
      }
    }
    return -1;
  })();
  const hasPrevChapter = currentChapterIndex > 0;
  const hasNextChapter = currentChapterIndex < chapters.length - 1;

  const handleForward = () => {
    if (chapters.length > 0 && hasNextChapter) {
      onSeekTo(chapters[currentChapterIndex + 1].time);
    } else if (!hasNext && chapters.length === 0) {
      onSeekTo(Math.min(timePos + SEEK_STEP, duration));
    } else if (!hasNext) {
      showBoundaryMsg(t("player.media.boundary.last"));
    } else {
      onSeekTo(Math.min(timePos + SEEK_STEP, duration));
    }
  };

  const handleBackward = () => {
    if (chapters.length > 0 && hasPrevChapter) {
      onSeekTo(chapters[currentChapterIndex - 1].time);
    } else if (!hasPrev && chapters.length === 0) {
      onSeekTo(Math.max(timePos - SEEK_STEP, 0));
    } else if (!hasPrev) {
      showBoundaryMsg(t("player.media.boundary.first"));
    } else {
      onSeekTo(Math.max(timePos - SEEK_STEP, 0));
    }
  };

  const volumeIcon = (() => {
    if (volume === 0 || muted) return <VolumeX />;
    if (volume <= 0.33) return <Volume className="ml-1" />;
    if (volume <= 0.66) return <Volume1 />;
    return <Volume2 />;
  })();

  const displayVolume = Number(muted ? 0 : volume);

  return (
    <main className="relative flex flex-row items-center gap-1 p-1">
      {boundary ? (
        <div className="windows95-border bg-primary windows95-text absolute right-0 bottom-full z-50 mb-1 px-1 py-0.5 whitespace-nowrap">
          {boundary}
        </div>
      ) : null}
      <section className="border-muted flex h-6 w-15 gap-1 border-r-2">
        <Button
          size="icon"
          className="size-6"
          title={t("player.media.key.play.pause")}
          aria-label={t("player.media.key.play.pause")}
          onClick={onPlay}
          disabled={!paused}
        >
          <Play />
        </Button>
        <Button
          size="icon"
          className="size-6"
          title={t("player.media.key.play.pause")}
          aria-label={t("player.media.key.play.pause")}
          onClick={onPause}
          disabled={paused}
        >
          <Pause />
        </Button>
      </section>

      <section className="border-muted flex h-6 w-15 gap-1 border-r-2">
        <Button
          size="icon"
          className="size-6"
          title={t("player.media.controls.backward")}
          aria-label={t("player.media.controls.backward")}
          onClick={handleBackward}
          disabled={timePos === 0}
        >
          <ChevronsLeft />
        </Button>
        <Button
          size="icon"
          className="size-6"
          title={t("player.media.controls.forward")}
          aria-label={t("player.media.controls.forward")}
          onClick={handleForward}
          disabled={timePos === duration}
        >
          <ChevronsRight />
        </Button>
      </section>

      <section className="border-muted flex h-6 gap-1 border-r-2 px-1">
        <Button
          size="icon"
          className="size-6"
          title={t("player.media.controls.previous.file")}
          aria-label={t("player.media.controls.previous.file")}
          onClick={() => {
            if (!hasPrev) showBoundaryMsg(t("player.media.boundary.first"));
            else onFilePrev();
          }}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          size="icon"
          className="size-6"
          title={t("player.media.controls.next.file")}
          aria-label={t("player.media.controls.next.file")}
          onClick={() => {
            if (!hasNext) showBoundaryMsg(t("player.media.boundary.last"));
            else onFileNext();
          }}
        >
          <SkipForward className="size-4" />
        </Button>
      </section>

      <section className="border-muted flex h-6 items-center gap-0.5 border-r-2 px-1">
        <div ref={speedRef} className="relative flex w-full items-center">
          <Button
            className="h-5 w-10 px-1"
            variant="default"
            title={t("player.media.osd.speed")}
            aria-label={t("player.media.osd.speed")}
            onClick={() => setSpeedOpen(!speedOpen)}
          >
            {`${speed}x`}
          </Button>
          {speedOpen ? (
            <div className="windows95-border bg-primary absolute bottom-full left-0 z-50 mb-0.5 w-20">
              {SPEEDS.map((rate) => (
                <Button
                  key={rate}
                  className={cn(
                    "flex w-full p-1 whitespace-nowrap",
                    speed === rate && "bg-secondary text-white"
                  )}
                  onClick={() => {
                    onSpeed(rate);
                    setSpeedOpen(false);
                  }}
                >
                  {`${rate}x`}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-muted flex h-6 items-center gap-0.5 border-r-2 px-1">
        <Button
          size="icon"
          className={cn("size-6", playlistOpen && "bg-secondary text-white")}
          title={t("player.media.playlist.toggle")}
          aria-label={t("player.media.playlist.toggle")}
          onClick={onTogglePlaylist}
        >
          <ListVideo className="size-4" />
        </Button>
      </section>

      {tracks.length > 0 ? (
        <Tracks
          tracks={tracks}
          onSelectAudio={onSelectAudio}
          onSelectSub={onSelectSub}
          onAddAudio={onAddAudio}
          onAddSubtitle={onAddSubtitle}
        />
      ) : null}

      {immersive ? (
        <section className="border-muted flex h-6 gap-1 border-l-2 px-1">
          <Button
            size="icon"
            className="size-6"
            title={t("player.media.key.autohide.toggle")}
            aria-label={t("player.media.key.autohide.toggle")}
            onClick={onToggleAutoHide}
          >
            <span className="text-xs font-bold">{autoHide ? <SquareX /> : <Square />}</span>
          </Button>
        </section>
      ) : null}

      <section className="border-muted ml-auto flex h-6 w-fit flex-row gap-1 border-l-2 px-1">
        <span className="windows95-text flex w-6 max-w-6 min-w-6 items-center text-right">
          {Math.round(displayVolume * 100)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          title={t("player.media.controls.mute")}
          aria-label={t("player.media.controls.mute")}
          onClick={onMute}
        >
          {volumeIcon}
        </Button>
        <div
          ref={volumeRef}
          className="windows95-border relative w-24 cursor-pointer items-center justify-center bg-white"
          onClick={(event) => {
            event.preventDefault();
            handleVolume(event.clientX);
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            setDragging(true);
            handleVolume(event.clientX);
          }}
        >
          <div
            className="bg-highlight absolute inset-y-0 left-0"
            style={{ width: `${displayVolume * 100}%` }}
          />
          <div
            className="windows95-active-border bg-primary pointer-events-none absolute top-0 bottom-0 w-2"
            style={{ left: `${displayVolume * 100}%`, transform: "translateX(-50%)" }}
          />
        </div>
      </section>
    </main>
  );
}

export default Controls;
