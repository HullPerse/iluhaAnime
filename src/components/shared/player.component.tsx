import { Video, videoFeatures } from "@videojs/react/video";

import { createPlayer } from "@videojs/react";
import {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { VideoStreamInfo } from "@/types";
import { useMediaStore } from "@/store/media.store";
import { useSettingsStore } from "@/store/settings.store";
import { usePlayerStore } from "@/store/player.store";

import Timeline from "./player/timeline.player";
import Controls from "./player/controls.player";
import Header from "./player/header.player";
import Keyboard from "./player/keyboard.player";
import EmptyPlayer from "./player/empty.player";
import Modal from "./modal.component";
import { cn } from "@/lib/index.utils";
import { usePlayer, selectTime } from "@videojs/react";
import Settings from "./player/settings.player";
import SeekOffset from "./player/offset.player";
import SkipButton from "./player/skip.player";
import JumpToTime from "./player/jump.player";
import { SmallLoader } from "./loader.component";

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
  audioReady,
  loading,
  autoAudio,
  autoSubs,
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
  audioReady?: boolean;
  loading?: boolean;
  autoAudio?: string[];
  autoSubs?: string[];
}) {
  const [uiVisible, setUiVisible] = useState<boolean>(true);
  const hideTimerRef = useRef<number | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [audioOverrideSrc, setAudioOverrideSrc] = useState<string | null>(null);

  const hasSeeked = useRef(false);
  const lastPosSaveRef = useRef(0);
  const POS_SAVE_INTERVAL = 2000;
  const effectiveSrc = audioOverrideSrc ?? src;

  const settings = usePlayerStore((s) => s.settings);
  const patchSettings = usePlayerStore((s) => s.patchSettings);
  const setPosition = useMediaStore((s) => s.setPosition);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showJumpToTime, setShowJumpToTime] = useState<boolean>(false);

  const videoStyle = useMemo(() => {
    const t: string[] = [];
    if (settings.rotation) t.push(`rotate(${settings.rotation}deg)`);
    if (settings.flipH) t.push("scaleX(-1)");
    if (settings.flipV) t.push("scaleY(-1)");
    if (settings.zoom !== 1) t.push(`scale(${settings.zoom})`);
    const f: string[] = [];
    if (settings.brightness !== 100)
      f.push(`brightness(${settings.brightness / 100})`);
    if (settings.contrast !== 100)
      f.push(`contrast(${settings.contrast / 100})`);
    if (settings.saturation !== 100)
      f.push(`saturate(${settings.saturation / 100})`);
    if (settings.hue) f.push(`hue-rotate(${settings.hue}deg)`);
    if (settings.blur) f.push(`blur(${settings.blur}px)`);
    if (settings.sepia) f.push(`sepia(${settings.sepia / 100})`);
    if (settings.grayscale) f.push(`grayscale(${settings.grayscale / 100})`);
    return {
      transform: t.length ? t.join(" ") : undefined,
      filter: f.length ? f.join(" ") : undefined,
      objectFit: settings.aspectRatio,
    } as React.CSSProperties;
  }, [settings]);

  useEffect(() => {
    let el = document.getElementById("sub-cue");
    if (!el) {
      el = document.createElement("style");
      el.id = "sub-cue";
      document.head.appendChild(el);
    }
    const hex = settings.subBgColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const bg =
      settings.subBgOpacity > 0
        ? `background:rgba(${r},${g},${b},${settings.subBgOpacity / 100});`
        : "";
    el.textContent = `video::cue{font-size:${settings.subFontSize}px;font-family:${settings.subFontFamily},sans-serif;color:${settings.subColor};${bg}}`;
  }, [
    settings.subFontSize,
    settings.subFontFamily,
    settings.subColor,
    settings.subBgOpacity,
    settings.subBgColor,
  ]);
  useEffect(() => () => document.getElementById("sub-cue")?.remove(), []);

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
      if (mediaPath) setPosition(mediaPath, t);
    },
    [mediaPath, setPosition],
  );

  // auto-hide ui for cinema mode
  useEffect(() => {
    if (!cinemaMode || !autoHideUi) {
      setUiVisible(true);
      document.body.style.cursor = "";
      return;
    }
    const show = () => {
      setUiVisible(true);
      document.body.style.cursor = "";
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setUiVisible(false);
        document.body.style.cursor = "none";
      }, useSettingsStore.getState().autoHideDelay);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      document.body.style.cursor = "";
    };
  }, [cinemaMode, autoHideUi]);

  const handleClose = useCallback(() => {
    if (mediaPath && videoEl) {
      setPosition(mediaPath, videoEl.currentTime);
    }
    onClose();
  }, [mediaPath, videoEl, onClose, setPosition]);

  return (
    <Provider>
      <Container className="flex flex-col h-full">
        <Keyboard
          mediaPath={mediaPath}
          onFileNext={onFileNext}
          onFilePrev={onFilePrev}
          onToggleAutoHide={onToggleAutoHide}
          onRequestJumpToTime={() => setShowJumpToTime(true)}
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
                onToggleSettings={() => setShowSettings((p) => !p)}
              />
            </div>

            {/* Single Video element — shared between both modes */}
            <section
              className={cn(
                "relative bg-black overflow-hidden",
                cinemaMode ? "h-full w-full" : "flex-1 min-h-0",
              )}
            >
              <SeekOffset mediaPath={mediaPath} />
              <JumpToTimeGate
                show={showJumpToTime}
                onClose={() => setShowJumpToTime(false)}
              />
              <SkipButton
                chapters={chapters}
                onFileNext={onFileNext}
                hasNext={hasNext}
              />
              {loading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
                  <SmallLoader className="text-primary size-20" />
                </div>
              )}
              {effectiveSrc ? (
                <Video
                  ref={setVideoEl}
                  src={effectiveSrc}
                  className="h-full w-full"
                  style={videoStyle}
                  controls={false}
                  preload="auto"
                  onTimeUpdate={(e) => {
                    const t = (e.target as HTMLVideoElement).currentTime;
                    onTimeUpdate?.(t);
                    const now = Date.now();
                    if (now - lastPosSaveRef.current >= POS_SAVE_INTERVAL) {
                      savePos(t);
                      lastPosSaveRef.current = now;
                    }
                  }}
                  onPlay={() => onPlayStateChange?.(true)}
                  onPause={() => onPlayStateChange?.(false)}
                  onEnded={() => onFileNext?.()}
                />
              ) : loading ? null : (
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
              <Timeline chapters={chapters} mediaPath={mediaPath} />
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
                audioReady={audioReady}
                loading={loading}
                autoAudio={autoAudio}
                autoSubs={autoSubs}
              />
            </div>
          </div>
        )}
      </Container>

      {showSettings && (
        <Modal
          header="Настройки"
          onClose={() => setShowSettings(false)}
          className="w-xl"
        >
          <Settings
            settings={settings}
            onChange={patchSettings}
            data-hotkeys-disabled
          />
        </Modal>
      )}
    </Provider>
  );
}

function JumpToTimeGate({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  const time = usePlayer(selectTime);
  if (!show) return null;
  return <JumpToTime seek={time?.seek} onClose={onClose} />;
}

export default Player;
