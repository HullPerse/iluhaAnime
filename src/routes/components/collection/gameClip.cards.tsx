import { Container, createPlayer, MuteButton, PlayButton } from "@videojs/react";
import { videoFeatures } from "@videojs/react/video";
import { Lightbulb, Pause, Play } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { ScrubBar } from "@/components/shared/video/controls/scrubBar.video";
import { VolumeBar } from "@/components/shared/video/controls/volumeBar.video";
import { VolumeGlyph } from "@/components/shared/video/controls/volumeGlyph.video";
import { VolumeInitializer } from "@/components/shared/video/controls/volumeInitializer.video";
import { Win95PlayerButton } from "@/components/shared/video/controls/win95PlayerButton.video";
import { ignore } from "@/lib/core/shared/promise.utils";
import { clipStart } from "@/lib/daily/clip.utils";

import AttachedVideo from "@/routes/components/collection/attachedVideo.cards";

const { Player: GameClipPlayer } = createPlayer({
  features: videoFeatures,
  displayName: "GameClipPlayer",
});

export function ClipPlayer({
  clipUrl,
  videoRef,
  startFraction,
  timeLabel,
  overlay = "",
  autoPlay = false,
  startAtZero = false,
  showTimeline = false,
  clipSeconds,
  cover = null,
  badge = null,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
}: {
  clipUrl: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  startFraction: number;
  timeLabel: string;
  overlay?: string;
  autoPlay?: boolean;
  startAtZero?: boolean;
  showTimeline?: boolean;
  clipSeconds?: number;
  cover?: ReactNode;
  badge?: ReactNode;
  onLoadedMetadata: (duration: number) => void;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
}) {
  return (
    <GameClipPlayer>
      <Container className="daily-op-player">
        <VolumeInitializer />
        <div className="windows95-border daily-frame-shell">
          <AttachedVideo
            videoRef={videoRef}
            src={clipUrl}
            className="daily-op-video"
            preload="metadata"
            playsInline
            controls={false}
            disablePictureInPicture
            aria-hidden={cover !== null ? true : undefined}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const next = Number.isFinite(video.duration) ? video.duration : 0;
              onLoadedMetadata(next);
              const start =
                clipSeconds === undefined
                  ? clipStart(next, startFraction)
                  : Math.min(clipStart(next, startFraction), Math.max(0, next - clipSeconds));
              video.currentTime = startAtZero ? 0 : start;
              if (autoPlay) ignore(video.play());
            }}
            onTimeUpdate={onTimeUpdate}
            onPlay={onPlay}
          />
          {cover}
          {badge}
          {overlay.length > 0 && (
            <span className="daily-frame-hint">
              <Lightbulb className="size-3 shrink-0" />
              <span>{overlay}</span>
            </span>
          )}
        </div>

        <div className="daily-op-toolbar" role="toolbar">
          <PlayButton
            render={(props, state) => (
              <Win95PlayerButton {...props}>
                {state.paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </Win95PlayerButton>
            )}
          />
          <span className="windows95-text shrink-0 text-xs tabular-nums">{timeLabel}</span>
          {showTimeline && <ScrubBar />}
          <div className="daily-op-volume">
            <MuteButton
              render={(props) => (
                <Win95PlayerButton {...props}>
                  <VolumeGlyph />
                </Win95PlayerButton>
              )}
            />
            <VolumeBar />
          </div>
        </div>
      </Container>
    </GameClipPlayer>
  );
}
