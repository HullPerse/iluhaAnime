import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import {
  OFFSET_LIMIT,
  OFFSET_STEP,
  OFFSET_STEP_FINE,
  SEEK_STEP,
  type KeybindAction,
} from "@/config/player/keybinds.config";
import { VOLUME_STEP } from "@/config/player/video.config";
import { usePlayerEvents } from "@/hooks/player/events.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { translate } from "@/lib/locale/i18n.utils";
import { fileNameFromPath } from "@/lib/player/title.utils";
import { ignore } from "@/lib/utils/promise.utils";
import {
  addExternalAudio,
  addExternalSubtitle,
  appendFiles,
  applyAudioOptions,
  applyColorOptions,
  applyHdrOptions,
  applyPlayerProfile,
  buildInitialOptions,
  closePlayerWindow,
  destroyPlayer,
  initPlayer,
  loadQueue,
  movePlaylistIndex,
  nextFile,
  playPlaylistIndex,
  previousFile,
  readPath,
  removePlaylistIndex,
  saveWatch,
  seekTo,
  selectTrack,
  setEofMode as setEofModeCommand,
  setMpvProperty,
  setPaused,
  setSpeed,
  setVideoMarginRatio,
  startFrameStep,
  takePendingOpen,
  transformOptions,
} from "@/lib/player/playback.utils";
import { useMediaStore } from "@/store/media.store";
import { useNotificationStore } from "@/store/notification.store";
import { usePlaybackStore, usePlayerStore } from "@/store/player.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  DroppedFramesData,
  EndOfFileMode,
  HwdecMode,
  MpvTrack,
  PlayerProfileId,
  PlayerSettings,
  SeekMode,
} from "@/types/videoPlayer";

import Cheatsheet from "./media/cheatsheet.player";
import Controls from "./media/controls.player";
import DiagnosticsOverlay from "./media/diagnostics.player";
import EmptyPlayer from "./media/empty.player";
import PlayerHeader from "./media/header.player";
import JumpToTime from "./media/jump.player";
import Keyboard from "./media/keyboard.player";
import PlayerModal from "./media/modal.player";
import OsdOverlay from "./media/offset.player";
import PlaylistPanel from "./media/playlist.player";
import SettingsPanel from "./media/settings.player";
import SkipButton from "./media/skip.player";
import PlayerStatus from "./media/status.player";
import Timeline from "./media/timeline.player";

const AUTO_HIDE_DELAY = 3000;
const WATCH_INTERVAL = 5000;
const DROP_TOAST_TIMEOUT = 6000;
const RESUME_MIN = 5;
const RESUME_END_MARGIN = 10;

const SUBTITLE_FILTERS = ["srt", "ass", "ssa", "vtt", "sub", "idx"];
const AUDIO_FILTERS = ["mka", "flac", "aac", "m4a", "ac3", "dts", "mp3", "wav", "ogg", "opus"];

function barClass(
  position: "top" | "bottom",
  immersive: boolean,
  hidden: boolean,
): string {
  if (!immersive) return "z-20 shrink-0 bg-primary";
  return cn(
    "z-20 shrink-0 bg-primary/90 absolute inset-x-0 transition-opacity duration-300",
    position === "top" ? "top-0" : "bottom-0",
    hidden && "pointer-events-none opacity-0",
  );
}

function videoSectionClass(immersive: boolean): string {
  if (immersive) return "relative min-h-0 flex-1 overflow-hidden";
  return "relative m-1 min-h-0 flex-1 overflow-hidden windows95-active-border";
}

function PlayerComponent() {
  const { t } = useI18n();

  const path = usePlaybackStore((state) => state.path);
  const hasFile = usePlaybackStore((state) => state.hasFile);
  const duration = usePlaybackStore((state) => state.duration);
  const paused = usePlaybackStore((state) => state.paused);
  const muted = usePlaybackStore((state) => state.muted);
  const speed = usePlaybackStore((state) => state.speed);
  const eofReached = usePlaybackStore((state) => state.eofReached);
  const playlistIndex = usePlaybackStore((state) => state.playlistIndex);
  const playlistCount = usePlaybackStore((state) => state.playlistCount);
  const tracks = usePlaybackStore((state) => state.tracks);
  const chapters = usePlaybackStore((state) => state.chapters);
  const seekTarget = usePlaybackStore((state) => state.seekTarget);

  const eofMode = usePlayerStore((state) => state.eofMode);
  const hwdec = usePlayerStore((state) => state.hwdec);
  const seekMode = usePlayerStore((state) => state.seekMode);
  const volume = usePlayerStore((state) => state.volume);
  const autoHide = usePlayerStore((state) => state.autoHide);
  const profile = usePlayerStore((state) => state.profile);
  const settings = usePlayerStore((state) => state.settings);

  const [cinema, setCinema] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [barsVisible, setBarsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [dropAlert, setDropAlert] = useState<DroppedFramesData | null>(null);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);

  const videoRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<number | undefined>(undefined);
  const destroyTimerRef = useRef<number | null>(null);
  const dropTimerRef = useRef<number | null>(null);

  const immersive = cinema || fullscreen;
  const hasNext = playlistCount > 0 && playlistIndex < playlistCount - 1;
  const hasPrev = playlistIndex > 0;
  const barsHidden = immersive && autoHide && !barsVisible;
  const title = path ? fileNameFromPath(path) : t("player.media.title");

  useEffect(() => {
    if (destroyTimerRef.current !== null) {
      window.clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;
    }
    let disposed = false;

    const start = async () => {
      const store = usePlayerStore.getState();
      await initPlayer(
        buildInitialOptions({
          volume: store.volume,
          hwdec: store.hwdec,
          settings: store.settings,
        }),
      );
      await applyPlayerProfile(store.profile).catch(() => undefined);
      await applyHdrOptions(store.settings).catch(() => undefined);
      await applyColorOptions(store.settings).catch(() => undefined);
      await applyAudioOptions(store.settings).catch(() => undefined);
      await setEofModeCommand(store.eofMode);

      if (disposed) return;
      const request = await takePendingOpen();
      if (disposed) return;
      if (request && request.files.length > 0) {
        resumeRef.current = request.resume;
        await loadQueue(request.files, request.resume);
      }
    };

    start().catch((error: unknown) => {
      setFailed(true);
      useNotificationStore
        .getState()
        .add(
          translate(useSettingsStore.getState().language, "player.media.error.title"),
          "error",
          String(error),
        );
    });

    return () => {
      disposed = true;
      destroyTimerRef.current = window.setTimeout(() => {
        destroyTimerRef.current = null;
        ignore(destroyPlayer());
      }, 0);
    };
  }, []);

  const applyTransform = useCallback(async (settings: PlayerSettings) => {
    const options = transformOptions(settings);
    for (const [name, value] of Object.entries(options)) {
      await setMpvProperty(name, value);
    }
  }, []);

  useEffect(() => {
    return usePlayerStore.subscribe((state, previous) => {
      if (state.volume !== previous.volume) {
        ignore(setMpvProperty("volume", Math.round(state.volume * 100)));
      }
      if (state.hwdec !== previous.hwdec) {
        ignore(setMpvProperty("hwdec", state.hwdec));
      }
      if (state.profile !== previous.profile) {
        ignore(applyPlayerProfile(state.profile));
      }
      if (state.settings !== previous.settings) {
        ignore(applyTransform(state.settings));
        ignore(applyHdrOptions(state.settings));
        ignore(applyColorOptions(state.settings));
        ignore(applyAudioOptions(state.settings));
      }
      if (state.eofMode !== previous.eofMode) {
        ignore(setEofModeCommand(state.eofMode));
      }
    });
  }, [applyTransform]);

  const handleFileLoaded = useCallback(async () => {
    setFinished(false);
    const loaded = await readPath();
    if (!loaded) return;

    await setSpeed(1);
    const entry = await useMediaStore.getState().hydrate(loaded);

    await setMpvProperty("sub-delay", entry?.subOffset ?? 0);
    await setMpvProperty("audio-delay", entry?.audioOffset ?? 0);
    if (entry && typeof entry.audioTrack === "number") {
      await selectTrack("audio", entry.audioTrack);
    }
    if (entry && typeof entry.subtitleTrack === "number") {
      await selectTrack("sub", entry.subtitleTrack);
    }

    const pendingResume =
      usePlaybackStore.getState().playlistIndex === 0 ? resumeRef.current : undefined;
    resumeRef.current = undefined;
    const position = pendingResume ?? entry?.position ?? 0;
    const state = usePlaybackStore.getState();
    const inside =
      position > RESUME_MIN &&
      (state.duration <= 0 || position < state.duration - RESUME_END_MARGIN);
    if (inside) await seekTo(position, "exact");
    await setPaused(true);
  }, []);

  usePlayerEvents({
    onOpenRequest: (request) => {
      if (request.files.length === 0) return;
      resumeRef.current = request.resume;
      setFinished(false);
      ignore(loadQueue(request.files, request.resume));
    },
    onFileLoaded: () => {
      ignore(handleFileLoaded());
    },
    onEndFile: () => {
      setFinished(false);
    },
    onIdle: () => {
      setFinished(true);
    },
    onPlaybackRestart: () => {
      usePlaybackStore.getState().settleSeek();
    },
    onShutdown: () => {
      usePlaybackStore.getState().reset();
    },
    onError: () => {
      setFailed(true);
    },
    onDroppedFrames: (data) => {
      setDropAlert(data);
      if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
      dropTimerRef.current = window.setTimeout(() => setDropAlert(null), DROP_TOAST_TIMEOUT);
    },
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      const state = usePlaybackStore.getState();
      if (!state.path || state.paused || state.eofReached || state.duration <= 0) {
        return;
      }
      const entry = useMediaStore.getState().getEntry(state.path);
      useMediaStore
        .getState()
        .setPosition(state.path, state.timePos, state.duration);
      ignore(
        saveWatch(state.path, {
          position: state.timePos,
          duration: state.duration,
          subDelay: entry?.subOffset ?? 0,
          audioDelay: entry?.audioOffset ?? 0,
          updatedAt: Math.floor(Date.now() / 1000),
        }),
      );
    }, WATCH_INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (dropTimerRef.current !== null) window.clearTimeout(dropTimerRef.current);
    };
  }, []);

  useTauriEvent<{ paths: string[] }>(
    "tauri://drag-drop",
    (event) => {
      const extensions = useSettingsStore.getState().videoExtensions;
      const files = event.payload.paths.filter((path) =>
        extensions.some((extension) =>
          path.toLowerCase().endsWith(`.${extension.toLowerCase()}`),
        ),
      );
      if (files.length > 0) ignore(appendFiles(files));
    },
    { errorTag: "drag-drop" }
  );

  const syncMargins = useCallback(() => {
    if (immersive) {
      ignore(setVideoMarginRatio({ left: 0, right: 0, top: 0, bottom: 0 }));
      return;
    }
    const height = window.innerHeight || 1;
    const rect = videoRef.current?.getBoundingClientRect();
    const top = rect?.top ?? 0;
    const bottom = rect ? Math.max(0, height - rect.bottom) : 0;
    ignore(
      setVideoMarginRatio({
        left: 0,
        right: 0,
        top: top / height,
        bottom: bottom / height,
      }),
    );
  }, [immersive]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncMargins());
    observer.observe(element);
    return () => observer.disconnect();
  }, [syncMargins]);

  useEffect(() => {
    const win = getCurrentWindow();
    win
      .isFullscreen()
      .then(setFullscreen)
      .catch(() => undefined);

    const onResize = () => syncMargins();
    window.addEventListener("resize", onResize);
    syncMargins();
    return () => window.removeEventListener("resize", onResize);
  }, [syncMargins]);

  useEffect(() => {
    if (!autoHide) {
      setBarsVisible(true);
      return;
    }
    let timer = window.setTimeout(() => setBarsVisible(false), AUTO_HIDE_DELAY);
    const wake = () => {
      setBarsVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBarsVisible(false), AUTO_HIDE_DELAY);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, [autoHide]);

  const toggleFullscreen = useCallback(async () => {
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen().catch(() => fullscreen));
    await win.setFullscreen(next).catch(() => undefined);
    setFullscreen(next);
  }, [fullscreen]);

  const toggleCinema = useCallback(() => {
    setCinema((value) => !value);
  }, []);

  const exitCinemaMode = useCallback(() => {
    if (diagnosticsOpen) {
      setDiagnosticsOpen(false);
      return;
    }
    if (playlistOpen) {
      setPlaylistOpen(false);
      return;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (jumpOpen) {
      setJumpOpen(false);
      return;
    }
    if (cheatsheetOpen) {
      setCheatsheetOpen(false);
      return;
    }
    getCurrentWindow()
      .isFullscreen()
      .then(async (isFull) => {
        if (isFull) {
          await getCurrentWindow().setFullscreen(false);
          setFullscreen(false);
        } else if (cinema) {
          setCinema(false);
        } else {
          await closePlayerWindow();
        }
      })
      .catch(() => undefined);
  }, [cheatsheetOpen, cinema, diagnosticsOpen, jumpOpen, playlistOpen, settingsOpen]);

  const onPlay = useCallback(() => {
    const state = usePlaybackStore.getState();
    if (!state.hasFile) return;
    if (state.eofReached) {
      setFinished(false);
      ignore(seekTo(0, "exact").then(() => setPaused(false)));
      return;
    }
    ignore(setPaused(false));
  }, []);

  const onPause = useCallback(() => {
    ignore(setPaused(true));
  }, []);

  const onPlayPause = useCallback(() => {
    const state = usePlaybackStore.getState();
    if (state.paused) {
      onPlay();
      return;
    }
    onPause();
  }, [onPause, onPlay]);

  const onVideoClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.(
          "button, a, input, select, textarea, [role=button], [role=dialog]",
        )
      ) {
        return;
      }
      if (!usePlaybackStore.getState().hasFile) return;
      onPlayPause();
    },
    [onPlayPause],
  );

  const onScrub = useCallback((time: number) => {
    ignore(seekTo(time, "keyframes"));
  }, []);

  const onCommitSeek = useCallback((time: number) => {
    usePlaybackStore.getState().setSeekTarget(time);
    ignore(seekTo(time, "exact"));
  }, []);

  const onSeekTo = useCallback((time: number) => {
    usePlaybackStore.getState().setSeekTarget(time);
    const mode = usePlayerStore.getState().seekMode;
    ignore(seekTo(time, mode));
  }, []);

  const onSeekBy = useCallback((seconds: number) => {
    const state = usePlaybackStore.getState();
    const mode = usePlayerStore.getState().seekMode;
    const target = Math.max(
      0,
      Math.min(state.duration || Number.MAX_SAFE_INTEGER, state.timePos + seconds),
    );
    usePlaybackStore.getState().setSeekTarget(target);
    ignore(seekTo(target, mode));
  }, []);

  const onSkipChapter = useCallback((time: number) => {
    usePlaybackStore.getState().setSeekTarget(time);
    const mode = usePlayerStore.getState().seekMode;
    ignore(seekTo(time, mode).then(() => setPaused(false)));
  }, []);

  const onFileNext = useCallback(() => {
    setFinished(false);
    ignore(nextFile());
  }, []);

  const onFilePrev = useCallback(() => {
    setFinished(false);
    ignore(previousFile());
  }, []);

  const onVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    usePlayerStore.getState().setVolume(clamped);
    ignore(setMpvProperty("volume", Math.round(clamped * 100)));
    if (usePlaybackStore.getState().muted) {
      ignore(setMpvProperty("mute", false));
    }
  }, []);

  const onMute = useCallback(() => {
    ignore(setMpvProperty("mute", !usePlaybackStore.getState().muted));
  }, []);

  const onSpeed = useCallback((value: number) => {
    ignore(setSpeed(value));
  }, []);

  const handlePatchSettings = useCallback((patch: Partial<PlayerSettings>) => {
    usePlayerStore.getState().patchSettings(patch);
  }, []);

  const handleHwdec = useCallback((mode: HwdecMode) => {
    usePlayerStore.getState().setHwdec(mode);
  }, []);

  const handleProfile = useCallback((next: PlayerProfileId) => {
    usePlayerStore.getState().setProfile(next);
  }, []);

  const handleSeekMode = useCallback((mode: SeekMode) => {
    usePlayerStore.getState().setSeekMode(mode);
  }, []);

  const handleEofMode = useCallback((mode: EndOfFileMode) => {
    usePlayerStore.getState().setEofMode(mode);
  }, []);

  const handleSetAutoHide = useCallback((value: boolean) => {
    usePlayerStore.getState().setAutoHide(value);
  }, []);

  const persistTrack = useCallback((track: MpvTrack, kind: "audio" | "sub") => {
    const current = usePlaybackStore.getState().path;
    if (current) useMediaStore.getState().setTrack(current, kind, track.id);
  }, []);

  const onSelectTrack = useCallback(
    (kind: "audio" | "sub") => (id: number | "no") => {
      ignore(selectTrack(kind, id));
      if (typeof id === "number") {
        const track = usePlaybackStore.getState().tracks.find((entry) => entry.id === id);
        if (track) persistTrack(track, kind);
      }
    },
    [persistTrack],
  );

  const pickFiles = useCallback(
    async (extensions: string[]): Promise<string[]> => {
      const selection = await openDialog({
        multiple: true,
        filters: [{ name: t("player.media.tracks.external.filter"), extensions }],
      }).catch(() => null);
      if (!selection) return [];
      return Array.isArray(selection) ? selection : [selection];
    },
    [t],
  );

  const onAddExternalSubtitle = useCallback(async () => {
    const files = await pickFiles(SUBTITLE_FILTERS);
    for (const file of files) await addExternalSubtitle(file);
  }, [pickFiles]);

  const onAddExternalAudio = useCallback(async () => {
    const files = await pickFiles(AUDIO_FILTERS);
    for (const file of files) await addExternalAudio(file);
  }, [pickFiles]);

  const nudgeOffset = useCallback(
    (kind: "sub" | "audio", direction: number, fine: boolean) => {
      const current = usePlaybackStore.getState().path;
      if (!current) return;
      const store = useMediaStore.getState();
      const entry = store.getEntry(current);
      const base = (kind === "sub" ? entry?.subOffset : entry?.audioOffset) ?? 0;
      const step = fine ? OFFSET_STEP_FINE : OFFSET_STEP;
      const next = Math.max(
        -OFFSET_LIMIT,
        Math.min(OFFSET_LIMIT, Number((base + direction * step).toFixed(3))),
      );
      if (kind === "sub") store.setSubOffset(current, next);
      else store.setAudioOffset(current, next);
      ignore(setMpvProperty("sub-delay", kind === "sub" ? next : (entry?.subOffset ?? 0)));
      ignore(
        setMpvProperty(
          "audio-delay",
          kind === "audio" ? next : (entry?.audioOffset ?? 0),
        ),
      );
    },
    [],
  );

  const onKeyboardAction = useCallback(
    (action: KeybindAction) => {
      const actions: Record<KeybindAction, () => void> = {
        playPause: () => onPlayPause(),
        seekForward: () => onSeekBy(SEEK_STEP),
        seekBackward: () => onSeekBy(-SEEK_STEP),
        volumeUp: () => onVolume(usePlayerStore.getState().volume + VOLUME_STEP),
        volumeDown: () => onVolume(usePlayerStore.getState().volume - VOLUME_STEP),
        toggleMute: () => onMute(),
        frameBackward: () => ignore(startFrameStep(false)),
        frameForward: () => ignore(startFrameStep(true)),
        subtitleOffsetUp: () => nudgeOffset("sub", 1, false),
        subtitleOffsetDown: () => nudgeOffset("sub", -1, false),
        subtitleOffsetUpFine: () => nudgeOffset("sub", 1, true),
        subtitleOffsetDownFine: () => nudgeOffset("sub", -1, true),
        audioOffsetUp: () => nudgeOffset("audio", 1, false),
        audioOffsetDown: () => nudgeOffset("audio", -1, false),
        audioOffsetUpFine: () => nudgeOffset("audio", 1, true),
        audioOffsetDownFine: () => nudgeOffset("audio", -1, true),
        toggleAutoHide: () => handleSetAutoHide(!usePlayerStore.getState().autoHide),
        toggleDiagnostics: () => setDiagnosticsOpen((value) => !value),
        nextFile: () => onFileNext(),
        prevFile: () => onFilePrev(),
        toggleCheatsheet: () => setCheatsheetOpen((value) => !value),
        toggleFullscreen: () => ignore(toggleFullscreen()),
        jumpToTime: () => setJumpOpen(true),
        exitCinemaMode: () => exitCinemaMode(),
      };
      actions[action]();
    },
    [
      exitCinemaMode,
      handleSetAutoHide,
      nudgeOffset,
      onFileNext,
      onFilePrev,
      onMute,
      onPlayPause,
      onSeekBy,
      onVolume,
      toggleFullscreen,
    ],
  );

  const close = useCallback(() => {
    ignore(closePlayerWindow());
  }, []);

  const restart = useCallback(() => {
    setFinished(false);
    ignore(seekTo(0, "exact").then(() => setPaused(false)));
  }, []);

  const eofPaused = eofReached && eofMode === "pause";

  return (
    <div
      className={cn(
        "relative flex h-screen w-screen flex-col overflow-hidden",
        (!hasFile || failed) && "bg-black",
      )}
    >
      <Keyboard
        onAction={onKeyboardAction}
        onWheel={(direction) =>
          onVolume(usePlayerStore.getState().volume + direction * VOLUME_STEP)
        }
      />

      <div className={barClass("top", immersive, barsHidden)}>
        <PlayerHeader
          title={title}
          cinema={cinema}
          fullscreen={fullscreen}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleCinema={toggleCinema}
          onToggleFullscreen={() => ignore(toggleFullscreen())}
          onClose={close}
        />
      </div>

      <div className={videoSectionClass(immersive)}>
        <div className="flex h-full min-h-0 flex-row gap-1">
          <div ref={videoRef} className="relative min-h-0 flex-1 overflow-hidden" onClick={onVideoClick}>
            <OsdOverlay />
            {diagnosticsOpen ? <DiagnosticsOverlay /> : null}

            {dropAlert ? (
              <div className="windows95-border windows95-font absolute top-4 left-4 z-20 bg-primary/95 p-2 text-left text-sm">
                <span className="font-bold">
                  {t("player.media.watchdog.dropped", {
                    drops: dropAlert.drops,
                    percent: Math.round(dropAlert.ratio * 100),
                  })}
                </span>
              </div>
            ) : null}

            {!hasFile && !failed ? <EmptyPlayer /> : null}

            {hasFile ? (
              <SkipButton
                duration={duration}
                chapters={chapters}
                hasNext={hasNext}
                onSkip={onSkipChapter}
                onFileNext={onFileNext}
              />
            ) : null}

            {jumpOpen ? (
              <JumpToTime
                onCommit={onSeekTo}
                onClose={() => setJumpOpen(false)}
              />
            ) : null}

            <PlayerStatus
              visible={hasFile}
              finished={finished}
              eofPaused={eofPaused}
              failed={failed}
              hasNext={hasNext}
              onRestart={restart}
              onNext={onFileNext}
              onClose={close}
            />
          </div>

          {playlistOpen ? (
            <PlaylistPanel
              onPlay={(index) => playPlaylistIndex(index)}
              onRemove={(index) => removePlaylistIndex(index)}
              onMove={(from, to) => movePlaylistIndex(from, to)}
            />
          ) : null}
        </div>
      </div>

      <div className={barClass("bottom", immersive, barsHidden)}>
        <Timeline
          duration={duration}
          chapters={chapters}
          seekTarget={seekTarget}
          onScrub={onScrub}
          onCommitSeek={onCommitSeek}
        />
        <Controls
          paused={paused}
          duration={duration}
          chapters={chapters}
          tracks={tracks}
          hasPrev={hasPrev}
          hasNext={hasNext}
          immersive={immersive}
          autoHide={autoHide}
          speed={speed}
          volume={volume}
          muted={muted}
          eofMode={eofMode}
          playlistOpen={playlistOpen}
          onPlay={onPlay}
          onPause={onPause}
          onSeekTo={onSeekTo}
          onFilePrev={onFilePrev}
          onFileNext={onFileNext}
          onSpeed={onSpeed}
          onVolume={onVolume}
          onMute={onMute}
          onToggleAutoHide={() => handleSetAutoHide(!autoHide)}
          onTogglePlaylist={() => setPlaylistOpen((value) => !value)}
          onEofMode={handleEofMode}
          onSelectAudio={onSelectTrack("audio")}
          onSelectSub={onSelectTrack("sub")}
          onAddAudio={() => ignore(onAddExternalAudio())}
          onAddSubtitle={() => ignore(onAddExternalSubtitle())}
        />
      </div>

      {settingsOpen ? (
        <PlayerModal
          header={t("player.media.panel.settings")}
          className="w-xl"
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            settings={settings}
            hwdec={hwdec}
            seekMode={seekMode}
            eofMode={eofMode}
            autoHide={autoHide}
            profile={profile}
            onPatchSettings={handlePatchSettings}
            onHwdec={handleHwdec}
            onSeekMode={handleSeekMode}
            onEofMode={handleEofMode}
            onAutoHide={handleSetAutoHide}
            onProfile={handleProfile}
          />
        </PlayerModal>
      ) : null}

      {cheatsheetOpen ? (
        <PlayerModal
          header={t("player.media.panel.cheatsheet")}
          className="w-xl"
          onClose={() => setCheatsheetOpen(false)}
        >
          <Cheatsheet />
        </PlayerModal>
      ) : null}
    </div>
  );
}

export default PlayerComponent;
