import { cn } from "cn";
import {
  Captions,
  ChevronsLeft,
  ChevronsRight,
  ListVideo,
  Pause,
  Play,
  Square,
  SquareX,
  StepBack,
  StepForward,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { SEEK_STEP } from "@/config/keybinds.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { PlayerStream } from "@/types/playerStream";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { resolveChapterJump } from "@/lib/chapter.utils";
import type { ChapterJumpDirection } from "@/types/chapter";
import { scheduleTask } from "@/lib/shared.utils";
import { useCell } from "@/lib/signal.hook";
import { formatClock } from "@/lib/time.utils";
import { playbackAtoms } from "@/store/player.store";
import type { MpvChapter, MpvTrack } from "@/types/videoPlayer";

import NeighborFileButton from "../media/neighbor.player";
import StreamControl from "../media/stream.player";
import Timeline from "../media/timeline.player";
import VolumeControl from "../media/volume.player";

const BOUNDARY_TIMEOUT = 2000;

function ModernControls({
  paused,
  duration,
  chapters,
  tracks,
  hasPrev,
  hasNext,
  immersive,
  autoHide,
  volume,
  muted,
  playlistOpen,
  seekTarget,
  onPlay,
  onPause,
  onSeekTo,
  onScrub,
  onCommitSeek,
  onFilePrev,
  onFileNext,
  onFrameStep,
  onCycleSub,
  onVolume,
  onMute,
  onToggleAutoHide,
  onTogglePlaylist,
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
  volume: number;
  muted: boolean;
  playlistOpen: boolean;
  seekTarget: number | null;
  onPlay: () => void;
  onPause: () => void;
  onSeekTo: (seconds: number) => void;
  onScrub: (time: number) => void;
  onCommitSeek: (time: number) => void;
  onFilePrev: () => void;
  onFileNext: () => void;
  onFrameStep: (forward: boolean) => void;
  onCycleSub: () => void;
  onVolume: (volume: number) => void;
  onMute: () => void;
  onToggleAutoHide: () => void;
  onTogglePlaylist: () => void;
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
  const subCycleTitle = useKeybindTitle(
    t("player.media.key.subtitle.cycle"),
    "player.cycleSubtitle"
  );
  const timePos = useCell(playbackAtoms.timePos);
  const [boundary, setBoundary] = useState<string | null>(null);

  const showBoundaryMsg = (message: string) => {
    setBoundary(message);
    scheduleTask("timeout", BOUNDARY_TIMEOUT, () => setBoundary(null));
  };

  const runChapterJump = (direction: ChapterJumpDirection) => {
    const jump = resolveChapterJump({
      chapters,
      timePos,
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

  return (
    <div className="flex flex-col">
      <div className="flex flex-row items-center gap-1 px-1">
        <VolumeControl
          align="left"
          volume={volume}
          muted={muted}
          onVolume={onVolume}
          onMute={onMute}
        />
        <div className="min-w-0 flex-1">
          <Timeline
            duration={duration}
            chapters={chapters}
            seekTarget={seekTarget}
            onScrub={onScrub}
            onCommitSeek={onCommitSeek}
          />
        </div>
      </div>
      <main className="relative flex flex-row items-center gap-1 p-1">
        {boundary ? (
          <div className="windows95-border bg-primary windows95-text absolute right-0 bottom-full z-50 mb-1 px-1 py-0.5 whitespace-nowrap">
            {boundary}
          </div>
        ) : null}
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

        <section className="border-muted flex h-6 gap-1 border-r-2 px-1">
          <Button
            size="icon"
            className="size-6"
            title={prevChapterTitle}
            aria-label={t("player.media.controls.backward")}
            onClick={() => runChapterJump(-1)}
            disabled={timePos === 0}
          >
            <ChevronsLeft />
          </Button>
          <Button
            size="icon"
            className="size-6"
            title={t("player.media.key.frame.backward")}
            aria-label={t("player.media.key.frame.backward")}
            onClick={() => onFrameStep(false)}
          >
            <StepBack />
          </Button>
          <Button
            size="icon"
            className="size-6"
            title={t("player.media.key.frame.forward")}
            aria-label={t("player.media.key.frame.forward")}
            onClick={() => onFrameStep(true)}
          >
            <StepForward />
          </Button>
          <Button
            size="icon"
            className="size-6"
            title={nextChapterTitle}
            aria-label={t("player.media.controls.forward")}
            onClick={() => runChapterJump(1)}
            disabled={timePos === duration}
          >
            <ChevronsRight />
          </Button>
        </section>

        <section className="border-muted flex h-6 gap-1 border-r-2 px-1">
          <Button
            size="icon"
            className="size-6"
            title={subCycleTitle}
            aria-label={t("player.media.controls.subtitles")}
            onClick={onCycleSub}
            disabled={!tracks.some((track) => track.type === "sub")}
          >
            <Captions className="size-4" />
          </Button>
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

        <StreamControl stream={stream} />

        {immersive ? (
          <section className="border-muted flex h-6 gap-1 border-r-2 px-1">
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
        ) : null}

        <section className="border-muted ml-auto flex h-6 items-center border-l-2 px-1">
          <span className="windows95-text text-xs tabular-nums">
            {formatClock(seekTarget ?? timePos)} / {formatClock(duration)}
          </span>
        </section>
      </main>
    </div>
  );
}

export default ModernControls;
