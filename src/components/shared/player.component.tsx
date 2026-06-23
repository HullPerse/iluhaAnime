import { Video, videoFeatures } from "@videojs/react/video";

import { createPlayer } from "@videojs/react";
import { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import type { VideoStreamInfo } from "@/types";
import { savePosition } from "@/lib/storage";

import Timeline from "./player/timeline.player";
import Controls from "./player/controls.player";
import Header from "./player/header.player";
import Keyboard from "./player/keyboard.player";
import EmptyPlayer from "./player/empty.player";
import { cn } from "@/lib/utils";

const { Provider, Container } = createPlayer({ features: videoFeatures });

function Player({
  header,
  onClose,
  src,
  chapters,
  mediaPath,
  streams,
  special,
  onTimeUpdate,
  onPlayStateChange,
  initialTime,
  autoPlay,
  onFileNext,
  onFilePrev,
  hasNext,
  hasPrev,
  cinemaMode,
  autoHideUi,
  onToggleCinema,
  onToggleAutoHide,
}: {
  header: string;
  onClose: () => void;
  src: string | undefined;
  chapters?: { start_time: number; end_time: number; title: string }[];
  mediaPath?: string;
  streams?: VideoStreamInfo[];
  special?: ReactElement;
  onTimeUpdate?: (time: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  initialTime?: number;
  autoPlay?: boolean;
  onFileNext?: () => void;
  onFilePrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  cinemaMode?: boolean;
  autoHideUi?: boolean;
  onToggleCinema?: () => void;
  onToggleAutoHide?: () => void;
}) {
  const [uiVisible, setUiVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [audioOverrideSrc, setAudioOverrideSrc] = useState<string | null>(null);
  const hasSeeked = useRef(false);
  const effectiveSrc = audioOverrideSrc ?? src;

  useEffect(() => {
    if (videoEl && !hasSeeked.current) {
      if (initialTime !== undefined) {
        videoEl.currentTime = initialTime;
      }
      if (autoPlay) {
        videoEl.play();
      }
      hasSeeked.current = true;
    }
  }, [videoEl, initialTime, autoPlay]);

  const handleAudioSwitch = useCallback((newSrc: string | null) => {
    setAudioOverrideSrc(newSrc);
  }, []);

  const savePos = useCallback(
    (t: number) => {
      if (mediaPath) savePosition(mediaPath, t);
    },
    [mediaPath],
  );

  // Auto-hide UI on inactivity (cinema mode only)
  useEffect(() => {
    if (!cinemaMode || !autoHideUi) {
      setUiVisible(true);
      return;
    }
    const show = () => {
      setUiVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setUiVisible(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [cinemaMode, autoHideUi]);

  const handleClose = useCallback(() => {
    if (mediaPath && videoEl) {
      savePosition(mediaPath, videoEl.currentTime);
    }
    onClose();
  }, [mediaPath, videoEl, onClose]);

  return (
    <Provider>
      <Container className="flex flex-col h-full">
        <Keyboard
          mediaPath={mediaPath}
          onFileNext={onFileNext}
          onFilePrev={onFilePrev}
          hasNext={hasNext}
          hasPrev={hasPrev}
          onToggleAutoHide={onToggleAutoHide}
        />
        {!src ? (
          <EmptyPlayer />
        ) : (
          <div
            className={cn(
              "h-full",
              cinemaMode
                ? "relative w-full overflow-hidden"
                : "flex flex-col mr-1 windows95-active-border bg-primary outline-none",
            )}
          >
            {/* Top overlay / Header */}
            <div
              className={cn(
                !cinemaMode && "shrink-0",
                cinemaMode &&
                  "absolute top-0 left-0 right-0 z-10 bg-primary/90 transition-opacity duration-300",
                cinemaMode &&
                  autoHideUi &&
                  !uiVisible &&
                  "opacity-0 pointer-events-none",
              )}
            >
              <Header
                header={header}
                onClose={handleClose}
                special={special}
                cinemaMode={cinemaMode}
                onToggleCinema={onToggleCinema}
              />
            </div>

            {/* Single Video element — shared between both modes */}
            <section
              className={cn(
                "bg-black overflow-hidden",
                cinemaMode ? "h-full w-full" : "flex-1 min-h-0",
              )}
            >
              {effectiveSrc ? (
                <Video
                  ref={setVideoEl}
                  src={effectiveSrc}
                  className="h-full w-full object-contain"
                  controls={false}
                  preload="metadata"
                  onTimeUpdate={(e) => {
                    const t = (e.target as HTMLVideoElement).currentTime;
                    onTimeUpdate?.(t);
                    savePos(t);
                  }}
                  onPlay={() => onPlayStateChange?.(true)}
                  onPause={() => onPlayStateChange?.(false)}
                />
              ) : (
                <EmptyPlayer />
              )}
            </section>

            {/* Bottom overlay — Timeline + Controls */}
            <div
              className={cn(
                !cinemaMode && "shrink-0",
                cinemaMode &&
                  "absolute bottom-0 left-0 right-0 z-10 bg-primary transition-opacity duration-300",
                cinemaMode &&
                  autoHideUi &&
                  !uiVisible &&
                  "opacity-0 pointer-events-none",
              )}
            >
              <Timeline chapters={chapters} />
              <Controls
                chapters={chapters}
                mediaPath={mediaPath}
                streams={streams}
                videoEl={videoEl}
                onAudioSwitch={handleAudioSwitch}
                onFileNext={onFileNext}
                onFilePrev={onFilePrev}
                hasNext={hasNext}
                hasPrev={hasPrev}
                onToggleAutoHide={onToggleAutoHide}
                autoHideUi={autoHideUi}
                cinemaMode={cinemaMode}
              />
            </div>
          </div>
        )}
      </Container>
    </Provider>
  );
}

export default Player;
