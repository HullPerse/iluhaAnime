import { Container, createPlayer, MuteButton, PlayButton, Time } from "@videojs/react";
import { YouTubeVideo } from "@videojs/react/media/youtube-video";
import { videoFeatures } from "@videojs/react/video";
import { cn } from "cn";
import { Pause, Play } from "lucide-react";
import { useRef } from "react";

import { CaptionsSelect } from "@/components/shared/video/controls/captions.video";
import { FullscreenToggle } from "@/components/shared/video/controls/fullscreen.video";
import { OpenInBrowserButton } from "@/components/shared/video/controls/openInBrowser.video";
import { ScrubBar } from "@/components/shared/video/controls/scrubBar.video";
import { VolumeBar } from "@/components/shared/video/controls/volumeBar.video";
import { VolumeGlyph } from "@/components/shared/video/controls/volumeGlyph.video";
import { VolumeInitializer } from "@/components/shared/video/controls/volumeInitializer.video";
import { Win95PlayerButton } from "@/components/shared/video/controls/win95PlayerButton.video";
import NativeVideo from "@/components/shared/video/native.video";
import type { VideoPlayerProps } from "@/types/media";

const { Player: VideoPlayerProvider } = createPlayer({
  features: videoFeatures,
  displayName: "VideoPlayer",
});

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
