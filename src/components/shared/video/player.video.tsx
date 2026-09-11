import { useRef } from "react";

import { Container, createPlayer, MuteButton, PlayButton, Time } from "@videojs/react";
import { videoFeatures } from "@videojs/react/video";
import { YouTubeVideo } from "@videojs/react/media/youtube-video";
import { Pause, Play } from "lucide-react";

import NativeVideo from "@/components/shared/video/native.video";
import {
  CaptionsSelect,
  FullscreenToggle,
  OpenInBrowserButton,
  ScrubBar,
  VolumeBar,
  VolumeGlyph,
  VolumeInitializer,
  Win95PlayerButton,
} from "@/components/shared/video/controls.video";
import { cn } from "cn";

const { Player: VideoPlayerProvider } = createPlayer({
  features: videoFeatures,
  displayName: "VideoPlayer",
});

export interface VideoPlayerProps {
  youtubeId?: string | null;
  webmUrl?: string | null;
  title: string;
  className?: string;
}

export function VideoPlayer({ youtubeId, webmUrl, title, className }: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isYoutube = !webmUrl && !!youtubeId;

  if (!isYoutube && !webmUrl) return null;

  return (
    <VideoPlayerProvider>
      <Container className={cn("flex w-full flex-col gap-1", className)}>
        <VolumeInitializer />
        <div className="aspect-video w-full overflow-hidden bg-black">
          {webmUrl ? (
            <NativeVideo src={webmUrl} title={title} />
          ) : (
            <YouTubeVideo
              ref={iframeRef}
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
            />
          )}
        </div>
        <div className="flex flex-row items-center gap-1" role="toolbar" aria-label={title}>
          <PlayButton
            render={(props, state) => (
              <Win95PlayerButton {...props}>
                {state.paused ? <Play className="size-3" /> : <Pause className="size-3" />}
              </Win95PlayerButton>
            )}
          />
          <Time.Group className="windows95-text shrink-0 text-xs tabular-nums">
            <Time.Value type="current" />
            <Time.Separator> / </Time.Separator>
            <Time.Value type="duration" />
          </Time.Group>
          <ScrubBar />
          <MuteButton
            render={(props) => (
              <Win95PlayerButton {...props}>
                <VolumeGlyph />
              </Win95PlayerButton>
            )}
          />
          <VolumeBar />
          {isYoutube ? (
            <>
              <CaptionsSelect />
              <OpenInBrowserButton youtubeId={youtubeId ?? ""} />
            </>
          ) : null}
          <FullscreenToggle iframeRef={iframeRef} />
        </div>
      </Container>
    </VideoPlayerProvider>
  );
}
