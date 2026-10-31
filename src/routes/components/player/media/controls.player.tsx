import { cn } from "cn";
import {
  ChevronsLeft,
  ChevronsRight,
  ListVideo,
  Pause,
  Play,
  SkipForward,
  Square,
  SquareX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { SEEK_STEP } from "@/config/settings/keybinds.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { PlayerStream } from "@/types/player/playerStream";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { resolveChapterJump } from "@/lib/core/chapter.utils";
import type { ChapterJumpDirection } from "@/types/core/chapter";
import { scheduleTask } from "@/lib/core/shared.utils";
import { PLAYER_SPEEDS as SPEEDS } from "@/lib/core/speed.utils";
import { useCell, useDerived } from "@/lib/core/signal.hook";
import { playbackAtEnd, playbackAtStart, playbackAtoms, streamSession } from "@/store/player.store";
import type { MpvChapter, MpvTrack } from "@/types/player/videoPlayer";

import NeighborFileButton from "@/routes/components/player/media/neighbor.player";
import StreamControl from "@/routes/components/player/media/stream.player";
import Tracks from "@/routes/components/player/media/tracks.player";
import VolumeControl from "@/routes/components/player/media/volume.player";

const BOUNDARY_TIMEOUT = 2000;

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
  hideTracks,
  stream,
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
  hideTracks?: boolean;
  stream: PlayerStream;
}) {
  const { t } = useI18n();
  const playPauseTitle = useKeybindTitle(t("player.media.key.play.pause"), "player.playPause");
  const prevChapterTitle = useKeybindTitle(
    t("player.media.controls.backward"),
    "player.prevChapter"
  );
  const nextChapterTitle = useKeybindTitle(
    t("player.media.controls.forward"),
    "player.nextChapter"
  );
  const playlistTitle = useKeybindTitle(t("player.media.playlist.toggle"), "player.togglePlaylist");
  const autoHideTitle = useKeybindTitle(
    t("player.media.key.autohide.toggle"),
    "player.toggleAutoHide"
  );
  // Do not subscribe to timePos: it changes every tick. The boundary flags
  // only flip at the start/end, and the jump handler reads the live position.
  const atStart = useDerived(playbackAtStart);
  const atEnd = useDerived(playbackAtEnd);
  // A stream picks its voice-over and subtitles from the source, so the mpv
  // audio and subtitle lists would only duplicate that choice.
  const streaming = useCell(streamSession);
  const [speedOpen, setSpeedOpen] = useState<boolean>(false);
  const [boundary, setBoundary] = useState<string | null>(null);
  const speedRef = useRef<HTMLDivElement>(null);

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
    const task = scheduleTask("timeout", BOUNDARY_TIMEOUT, () => setBoundary(null));
    return () => task.cancel();
  }, [boundary]);

  const showBoundaryMsg = (message: string) => {
    setBoundary(message);
  };

  const runChapterJump = (direction: ChapterJumpDirection) => {
    const jump = resolveChapterJump({
      chapters,
      timePos: playbackAtoms.timePos.get(),
      duration,
      hasPrev,
      hasNext,
      direction,
      step: SEEK_STEP,
    });
    if (jump.kind === "seek") onSeekTo(jump.time);
    else
      showBoundaryMsg(
        t(jump.edge === "first" ? "player.media.boundary.first" : "player.media.boundary.last")
      );
  };

  const handleForward = () => runChapterJump(1);

  const handleBackward = () => runChapterJump(-1);

  return (
    <main className="relative flex flex-row items-center gap-1 p-1">
      {boundary && (
        <div className="windows95-border bg-primary windows95-text absolute right-0 bottom-full z-50 mb-1 px-1 py-0.5 whitespace-nowrap">
          {boundary}
        </div>
      )}
      <section className="border-muted flex h-6 w-15 gap-1 border-r-2">
        <Button
          size="icon"
          className="size-6"
          title={playPauseTitle}
          aria-label={t("player.media.key.play.pause")}
          onClick={onPlay}
          disabled={!paused}
        >
          <Play />
        </Button>
        <Button
          size="icon"
          className="size-6"
          title={playPauseTitle}
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
          title={prevChapterTitle}
          aria-label={t("player.media.controls.backward")}
          onClick={handleBackward}
          disabled={atStart}
        >
          <ChevronsLeft />
        </Button>
        <Button
          size="icon"
          className="size-6"
          title={nextChapterTitle}
          aria-label={t("player.media.controls.forward")}
          onClick={handleForward}
          disabled={atEnd}
        >
          <ChevronsRight />
        </Button>
      </section>

      {streaming !== null ? (
        <section className="border-muted flex h-6 gap-1 border-r-2 px-1">
          {/* A stream session has no previous file and its next item is an
              episode, not a playlist entry, so the file navigation is hidden. */}
          <Button
            size="icon"
            className="size-6"
            title={t("player.media.skip.next.episode")}
            aria-label={t("player.media.skip.next.episode")}
            onClick={() => {
              if (!hasNext) showBoundaryMsg(t("stream.noNextEpisode"));
              else onFileNext();
            }}
            disabled={!hasNext}
          >
            <SkipForward className="size-4" />
          </Button>
        </section>
      ) : (
        <section className="border-muted flex h-6 gap-1 border-r-2 px-1">
          <NeighborFileButton
            direction="prev"
            hasTarget={hasPrev}
            title={t("player.media.controls.previous.file")}
            ariaLabel={t("player.media.controls.previous.file")}
            onActivate={() => {
              if (!hasPrev) showBoundaryMsg(t("player.media.boundary.first"));
              else onFilePrev();
            }}
          />
          <NeighborFileButton
            direction="next"
            hasTarget={hasNext}
            title={t("player.media.controls.next.file")}
            ariaLabel={t("player.media.controls.next.file")}
            onActivate={() => {
              if (!hasNext) showBoundaryMsg(t("player.media.boundary.last"));
              else onFileNext();
            }}
          />
        </section>
      )}

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
          {speedOpen && (
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
          )}
        </div>
      </section>

      <StreamControl stream={stream} />

      <section className="border-muted flex h-6 items-center gap-0.5 border-r-2 px-1">
        <Button
          size="icon"
          className={cn("size-6", playlistOpen && "bg-secondary text-white")}
          title={playlistTitle}
          aria-label={t("player.media.playlist.toggle")}
          onClick={onTogglePlaylist}
        >
          <ListVideo className="size-4" />
        </Button>
      </section>

      {hideTracks !== true && streaming === null && tracks.length > 0 && (
        <Tracks
          tracks={tracks}
          onSelectAudio={onSelectAudio}
          onSelectSub={onSelectSub}
          onAddAudio={onAddAudio}
          onAddSubtitle={onAddSubtitle}
        />
      )}

      {immersive && (
        <section className="border-muted flex h-6 gap-1 border-l-2 px-1">
          <Button
            size="icon"
            className="size-6"
            title={autoHideTitle}
            aria-label={t("player.media.key.autohide.toggle")}
            onClick={onToggleAutoHide}
          >
            <span className="text-xs font-bold">{autoHide ? <SquareX /> : <Square />}</span>
          </Button>
        </section>
      )}

      <VolumeControl volume={volume} muted={muted} onVolume={onVolume} onMute={onMute} />
    </main>
  );
}

export default Controls;
