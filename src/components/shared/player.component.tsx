import { Video, videoFeatures } from "@videojs/react/video";

import { createPlayer } from "@videojs/react";
import { ReactElement, useCallback, useEffect, useRef, useState } from "react";
import type { VideoStreamInfo } from "@/types";

import Timeline from "./player/timeline.player";
import Controls from "./player/controls.player";
import Header from "./player/header.player";
import Keyboard from "./player/keyboard.player";

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
}) {
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
      if (mediaPath)
        try {
          localStorage.setItem(`pos:${mediaPath}`, String(t));
        } catch {}
    },
    [mediaPath],
  );

  const handleClose = useCallback(() => {
    if (mediaPath && videoEl) {
      try {
        localStorage.setItem(`pos:${mediaPath}`, String(videoEl.currentTime));
      } catch {}
    }
    onClose();
  }, [mediaPath, videoEl, onClose]);

  return (
    <Provider>
      <Container className="flex flex-col h-full mr-1 windows95-active-border bg-primary outline-none">
        <Header header={header} onClose={handleClose} special={special} />
        {!src ? (
          <section className="flex-1 min-h-0 bg-black overflow-hidden flex items-center justify-center">
            <span className="text-white windows95-font text-xs">
              Ожидается видео
            </span>
          </section>
        ) : (
          <>
            <Keyboard />
            <section className="flex-1 min-h-0 bg-black overflow-hidden">
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
                <span className="text-white windows95-font text-xs">
                  Ожидается видео
                </span>
              )}
            </section>
            <Timeline chapters={chapters} />
            <Controls
              chapters={chapters}
              mediaPath={mediaPath}
              streams={streams}
              videoEl={videoEl}
              onAudioSwitch={handleAudioSwitch}
            />
          </>
        )}
      </Container>
    </Provider>
  );
}

export default Player;
