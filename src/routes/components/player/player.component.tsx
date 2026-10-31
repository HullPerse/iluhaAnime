import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { VOLUME_STEP } from "@/config/player/video.config";
import { useI18n } from "@/hooks/i18n.hook";
import { usePlayerDiscordPresence } from "@/hooks/player/discordPresence.hook";
import { usePlayerFileDrop } from "@/hooks/player/fileDrop.hook";
import { usePlayerEvents } from "@/hooks/player/events.hook";
import { usePlayerKeyboardActions } from "@/hooks/player/keyboard.hook";
import { useLivePlaylistSync } from "@/hooks/player/liveSync.hook";
import { usePlayerScreen } from "@/hooks/player/screen.hook";
import { useSeekHandlers } from "@/hooks/player/seek.hook";
import { usePlayerStream, useStreamNext } from "@/hooks/player/stream.hook";
import { useWindowControls } from "@/hooks/player/windowControls.hook";
import { useWindowDrag } from "@/hooks/player/windowDrag.hook";
import { useBarsAutoHide, useDropAlert } from "@/hooks/player/chromeState.hook";
import { usePlayerMargins } from "@/hooks/player/margins.hook";
import { usePlayerOffsets } from "@/hooks/player/offsets.hook";
import { usePlayerSession } from "@/hooks/player/session.hook";
import { usePlayerSettingsSync } from "@/hooks/player/settingsSync.hook";
import { useStreamPin } from "@/hooks/player/streamPin.hook";
import { useStreamTrackPrefs } from "@/hooks/player/streamTrackPrefs.hook";
import { usePlayerTracks } from "@/hooks/player/tracks.hook";
import { usePlayerWatchProgress } from "@/hooks/player/watchProgress.hook";
import { translate } from "@/lib/locale/i18n.utils";
import { scheduleTask } from "@/lib/core/shared.utils";
import { startsOnPlayerControl } from "@/lib/player/playerDrag.utils";
import {
  LOADING_TIMEOUT_MS,
  shouldShowEmptyPlayer,
  shouldShowLoadingSpinner,
} from "@/lib/core/loading.utils";
import {
  applyFileState,
  closePlayerWindow,
  loadQueue,
  movePlaylistIndex,
  nextFile,
  playPlaylistIndex,
  previousFile,
  readPath,
  readDuration,
  removePlaylistIndex,
  seekTo,
  setMpvProperty,
  setPaused,
  setSpeed,
  startFrameStep,
} from "@/lib/player/playback.utils";
import { movePlaylistFocus } from "@/lib/core/playlistFocus.utils";
import {
  RESUME_END_MARGIN,
  RESUME_MIN,
  resolveLoadPosition,
  needsExactSeek,
  shouldSkipFrontendSeek,
} from "@/lib/player/resume.utils";
import type { HwdecReload } from "@/types/player/resume";
import { stepSpeed } from "@/lib/core/speed.utils";
import {
  barClass,
  fileStatePatch,
  hideDefaultTracks,
  modernMenuEnabled,
  navigationAvailability,
  playerWindowTitle,
  restoreReloadPaused,
  rootClass,
  shouldHideCursor,
  videoSectionClass,
  wrapVideoMenu,
} from "@/lib/player/playerChrome.utils";
import { resolveViewChrome } from "@/lib/core/view.utils";
import { useCell } from "@/lib/core/signal.hook";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { hydrateMediaEntry } from "@/store/media.store";
import { addNotification } from "@/store/notification.store";
import {
  patchPlayerSettings,
  playbackAtoms,
  playerAtoms,
  resetPlayback,
  setAutoHide,
  setEofMode,
  setHwdec,
  setPlaybackMuted,
  streamSession,
  setPlaybackPaused,
  setPlaybackSpeed,
  setProfile,
  setSeekMode,
  setSeekTarget,
  setVolume,
  settleSeek,
} from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type {
  EndOfFileMode,
  HwdecMode,
  PlayerProfileId,
  PlayerSettings,
  PlayerViewMode,
  SeekMode,
} from "@/types/player/videoPlayer";

import PlayerBezel from "@/routes/components/player/bezel.player";
import BufferingOverlay from "@/routes/components/player/media/buffering.player";
import DiagnosticsOverlay from "@/routes/components/player/media/diagnostics.player";
import EmptyPlayer from "@/routes/components/player/media/empty.player";
import PlayerHeader from "@/routes/components/player/media/header.player";
import JumpToTime from "@/routes/components/player/media/jump.player";
import Keyboard from "@/routes/components/player/media/keyboard.player";
import OsdOverlay from "@/routes/components/player/media/offset.player";
import SkipButton from "@/routes/components/player/media/skip.player";
import PlayerStatus from "@/routes/components/player/media/status.player";
import PlayerBottomBar from "@/routes/components/player/modern/bottom.modern";
import { buildModernPlayerMenu } from "@/routes/components/player/modern/menu.modern";
import { PlayerPanel } from "@/routes/components/player/media/panel.player";
import PlayerSidePanel from "@/routes/components/player/side.player";

function PlayerComponent() {
  const { t } = useI18n();

  const path = useCell(playbackAtoms.path);
  const parseTitlesPlayer = useCell(settingsAtoms.parseTitlesPlayer);
  const hasFile = useCell(playbackAtoms.hasFile);
  const duration = useCell(playbackAtoms.duration);
  const paused = useCell(playbackAtoms.paused);
  const muted = useCell(playbackAtoms.muted);
  const speed = useCell(playbackAtoms.speed);
  const eofReached = useCell(playbackAtoms.eofReached);
  const playlistIndex = useCell(playbackAtoms.playlistIndex);
  const playlistCount = useCell(playbackAtoms.playlistCount);
  const tracks = useCell(playbackAtoms.tracks);
  const chapters = useCell(playbackAtoms.chapters);
  const seekTarget = useCell(playbackAtoms.seekTarget);
  const streamResume = useCell(playbackAtoms.streamResume);
  const pausedForCache = useCell(playbackAtoms.pausedForCache);
  const ready = useCell(playbackAtoms.ready);

  const eofMode = useCell(playerAtoms.eofMode);
  const hwdec = useCell(playerAtoms.hwdec);
  const seekMode = useCell(playerAtoms.seekMode);
  const volume = useCell(playerAtoms.volume);
  const autoHide = useCell(playerAtoms.autoHide);
  const alwaysOnTop = useCell(playerAtoms.alwaysOnTop);
  const profile = useCell(playerAtoms.profile);
  const settings = useCell(playerAtoms.settings);
  const playerType = useCell(settingsAtoms.playerType);
  const playerContextMenu = useCell(settingsAtoms.playerContextMenu);
  const showModernMenu = modernMenuEnabled(playerType, playerContextMenu);

  const [cinema, setCinema] = useState(false);
  const [viewMode, setViewMode] = useState<PlayerViewMode>("normal");
  const [fullscreen, setFullscreen] = useState(false);
  const [barsVisible, setBarsVisible] = useState(true);
  const [panel, setPanel] = useState<null | "settings" | "cheatsheet">(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistFocus, setPlaylistFocus] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [hasShownFrame, setHasShownFrame] = useState(false);

  const resumeRef = useRef<number | undefined>(undefined);
  const hwdecReloadRef = useRef<HwdecReload | null>(null);
  const loadEpochRef = useRef(0);

  const chrome = resolveViewChrome({
    mode: viewMode,
    cinema,
    fullscreen,
    autoHide,
    barsVisible,
    menuOpen,
  });
  const immersive = chrome.fullBleed;
  const barsAutoHide = chrome.barsAutoHide;
  const stream = useCell(streamSession);
  usePlayerDiscordPresence();
  const streamNext = useStreamNext();
  // The window owns the stream session for the bar and the context menu, so a
  // switch started from either place is the same one, guarded once.
  const playerStream = usePlayerStream();
  // A stream session has no mpv playlist: its next episode is a new source
  // resolution, not playlist-next, and it has no previous item.
  const { hasNext, hasPrev } = navigationAvailability({
    stream: stream !== null,
    hasNextEpisode: streamNext.hasNext,
    playlistCount,
    playlistIndex,
  });
  const barsHidden = chrome.barsHidden;
  const { dropAlert, showDropAlert } = useDropAlert();
  const cursorHidden = shouldHideCursor({
    barsHidden,
    panelOpen: panel !== null,
    jumpOpen,
    diagnosticsOpen,
    playlistOpen,
    menuOpen,
    dropAlert,
  });
  const title = playerWindowTitle({ path, stream, parseTitlesPlayer, t });

  const { videoRef, syncMargins, syncMarginsRef } = usePlayerMargins(immersive);

  const { failed, setFailed, loadingFile, setLoadingFile, liveWatch, setLiveWatch } =
    usePlayerSession({ videoRef, syncMarginsRef, resumeRef });

  const reloadPlayingFile = useCallback(() => {
    const playlistIndex = playbackAtoms.playlistIndex.get();
    if (!playbackAtoms.hasFile.get() || playlistIndex < 0) return;
    hwdecReloadRef.current = {
      position: playbackAtoms.timePos.get(),
      paused: playbackAtoms.paused.get(),
    };
    setLoadingFile(true);
    playPlaylistIndex(playlistIndex).catch((error: unknown) => {
      hwdecReloadRef.current = null;
      setLoadingFile(false);
      reportBackgroundError("player.reload", error);
    });
  }, [setLoadingFile]);

  useLivePlaylistSync(liveWatch, { onPlayingFileModified: reloadPlayingFile });
  useStreamPin(stream, loadingFile);
  useStreamTrackPrefs(stream, tracks);
  usePlayerFileDrop();
  usePlayerSettingsSync();

  const handleFileLoaded = useCallback(async () => {
    loadEpochRef.current += 1;
    const epoch = loadEpochRef.current;
    const isCurrent = () => loadEpochRef.current === epoch;
    setFinished(false);
    const loaded = await readPath();
    if (!loaded || !isCurrent()) return;
    if (streamSession.get() !== null) {
      // A stream has no local media entry and no local watch state; its
      // position is saved under the session's own watch key.
      syncMarginsRef.current(true);
      return;
    }
    const reload = hwdecReloadRef.current;
    const entry = await hydrateMediaEntry(loaded);
    if (!isCurrent()) return;

    await applyFileState(fileStatePatch(entry, playbackAtoms.speed.get() || 1));
    if (!isCurrent()) return;
    hwdecReloadRef.current = null;

    const resume = resumeRef.current;
    resumeRef.current = undefined;
    const liveDuration = await readDuration();
    if (!isCurrent()) return;
    const position = resolveLoadPosition(reload, resume, entry?.position);
    const inside =
      position > RESUME_MIN && (liveDuration <= 0 || position < liveDuration - RESUME_END_MARGIN);
    if (!shouldSkipFrontendSeek(reload, resume, position)) {
      if (needsExactSeek(reload, position, inside)) await seekTo(position, "exact");
    }
    if (!isCurrent()) return;
    await setPaused(true);
    await restoreReloadPaused(reload);
    if (!isCurrent()) return;
    syncMarginsRef.current(true);
  }, [syncMarginsRef]);

  usePlayerEvents({
    onOpenRequest: (request) => {
      if (request.files.length === 0) return;
      loadEpochRef.current += 1;
      setFinished(false);
      setLoadingFile(true);
      if (request.stream) {
        // Same rule as init: the Rust side owns the stream load, because only
        // it can set `http-header-fields` before the file is opened.
        streamSession.set(request.stream);
        return;
      }
      streamSession.set(null);
      resumeRef.current = request.resume;
      setLiveWatch(request.watch ?? null);
      // The window owns the load for a local queue: the backend only raises it
      // and emits this request, so this is the one `loadfile` for the file.
      ignore(loadQueue(request.files, request.resume, request.startIndex));
    },
    onFileLoaded: () => {
      ignore(handleFileLoaded());
    },
    onEndFile: () => {
      setFinished(false);
      // A stream has no playlist to advance; the next episode is resolved when
      // the end-of-file mode asks for it.
      if (streamSession.get() !== null && eofMode === "next" && streamNext.hasNext) {
        setLoadingFile(true);
        ignore(streamNext.goNext());
      }
    },
    onIdle: () => {
      setFinished(true);
    },
    onPlaybackRestart: () => {
      settleSeek();
      setHasShownFrame(true);
      setLoadingFile(false);
      syncMargins(true);
    },
    onShutdown: () => {
      resetPlayback();
    },
    onError: () => {
      setFailed(true);
      setLoadingFile(false);
    },
    onDroppedFrames: (data) => {
      showDropAlert(data);
    },
  });

  useEffect(() => {
    if (!loadingFile) return;
    const task = scheduleTask("timeout", LOADING_TIMEOUT_MS, () => setLoadingFile(false));
    return () => task.cancel();
  }, [loadingFile, setLoadingFile]);

  usePlayerWatchProgress({ playlistOpen });

  useBarsAutoHide(barsAutoHide, setBarsVisible);

  const {
    onMouseDown: onVideoMouseDown,
    onMouseMove: onVideoMouseMove,
    onMouseUp: onVideoMouseUp,
    consumeDrag: consumeVideoDrag,
  } = useWindowDrag(!chrome.showHeader);

  const closeOverlay = useCallback(() => {
    if (diagnosticsOpen) {
      setDiagnosticsOpen(false);
      return true;
    }
    if (playlistOpen) {
      setPlaylistOpen(false);
      return true;
    }
    if (panel !== null) {
      setPanel(null);
      return true;
    }
    if (jumpOpen) {
      setJumpOpen(false);
      return true;
    }
    return false;
  }, [diagnosticsOpen, jumpOpen, panel, playlistOpen]);

  const { toggleFullscreen, applyViewMode, toggleCinema, applyAlwaysOnTop, exitCinemaMode } =
    useWindowControls({
      cinema,
      closeOverlay,
      fullscreen,
      setCinema,
      setFullscreen,
      setViewMode,
      viewMode,
    });

  const onPlay = useCallback(() => {
    if (!playbackAtoms.hasFile.get()) return;
    if (playbackAtoms.eofReached.get()) {
      setFinished(false);
      setSeekTarget(0);
      setPlaybackPaused(false);
      seekTo(0, "exact")
        .then(() => setPaused(false))
        .catch(() => {
          setPlaybackPaused(true);
        });
      return;
    }
    setPlaybackPaused(false);
    setPaused(false).catch(() => setPlaybackPaused(true));
  }, []);

  const onPause = useCallback(() => {
    setPlaybackPaused(true);
    setPaused(true).catch(() => setPlaybackPaused(false));
  }, []);

  const onPlayPause = useCallback(() => {
    if (playbackAtoms.paused.get()) {
      onPlay();
      return;
    }
    onPause();
  }, [onPause, onPlay]);

  const onVideoClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (consumeVideoDrag()) return;
      if (startsOnPlayerControl(event.target)) return;
      if (!playbackAtoms.hasFile.get()) return;
      if (loadingFile) return;
      onPlayPause();
    },
    [consumeVideoDrag, loadingFile, onPlayPause]
  );

  const onFileNext = useCallback(() => {
    setFinished(false);
    setLoadingFile(true);
    if (streamSession.get() !== null) {
      ignore(streamNext.goNext());
      return;
    }
    ignore(nextFile());
  }, [setLoadingFile, streamNext]);

  const {
    onScrub,
    onCommitSeek,
    onSeekTo,
    onSeekBy,
    onSkipChapter,
    onSeekPercent,
    onSkipShortcut,
    onChapterJump,
  } = useSeekHandlers({ hasPrev, hasNext, onFileNext });

  const onFilePrev = useCallback(() => {
    setFinished(false);
    setLoadingFile(true);
    ignore(previousFile());
  }, [setLoadingFile]);

  const onPlayIndex = useCallback(
    (index: number) => {
      setLoadingFile(true);
      return playPlaylistIndex(index);
    },
    [setLoadingFile]
  );

  const onVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setVolume(clamped);
    if (playbackAtoms.muted.get()) {
      setPlaybackMuted(false);
      setMpvProperty("mute", false).catch(() => setPlaybackMuted(true));
    }
  }, []);

  const onMute = useCallback(() => {
    const next = !playbackAtoms.muted.get();
    setPlaybackMuted(next);
    setMpvProperty("mute", next).catch(() => setPlaybackMuted(!next));
  }, []);

  const onSpeed = useCallback((value: number) => {
    const previous = playbackAtoms.speed.get();
    setPlaybackSpeed(value);
    setSpeed(value).catch(() => setPlaybackSpeed(previous));
  }, []);

  const handlePatchSettings = useCallback((patch: Partial<PlayerSettings>) => {
    patchPlayerSettings(patch);
  }, []);

  const handleHwdec = useCallback(
    (mode: HwdecMode) => {
      const hasFile = playbackAtoms.hasFile.get();
      const playlistIndex = playbackAtoms.playlistIndex.get();
      const timePos = playbackAtoms.timePos.get();
      const paused = playbackAtoms.paused.get();
      setHwdec(mode);
      if (!hasFile || playlistIndex < 0) return;
      hwdecReloadRef.current = { position: timePos, paused };
      setLoadingFile(true);
      setMpvProperty("hwdec", mode)
        .then(() => playPlaylistIndex(playlistIndex))
        .catch((error: unknown) => {
          hwdecReloadRef.current = null;
          setLoadingFile(false);
          reportBackgroundError("player.hwdec.reload", error);
          addNotification(
            translate(settingsAtoms.language.get(), "player.media.error.title"),
            "error",
            String(error)
          );
        });
    },
    [setLoadingFile]
  );

  const handleProfile = useCallback((next: PlayerProfileId) => {
    setProfile(next);
  }, []);

  const handleSeekMode = useCallback((mode: SeekMode) => {
    setSeekMode(mode);
  }, []);

  const handleEofMode = useCallback((mode: EndOfFileMode) => {
    setEofMode(mode);
  }, []);

  const handleSetAutoHide = useCallback((value: boolean) => {
    setAutoHide(value);
  }, []);

  const { onSelectTrack, onCycleTrack, onAddExternalSubtitle, onAddExternalAudio } =
    usePlayerTracks();
  const { nudgeOffset, onResetDelays } = usePlayerOffsets();

  const onSpeedStep = useCallback(
    (direction: number) => {
      onSpeed(stepSpeed(playbackAtoms.speed.get(), direction));
    },
    [onSpeed]
  );

  const onFrameStep = useCallback((forward: boolean) => {
    ignore(startFrameStep(forward));
  }, []);

  const onCycleSub = useCallback(() => {
    onCycleTrack("sub");
  }, [onCycleTrack]);

  const onPlaylistFocus = useCallback(
    (delta: number) => {
      if (!playlistOpen) return;
      setPlaylistFocus((previous) =>
        movePlaylistFocus(
          previous,
          playbackAtoms.playlistIndex.get(),
          playbackAtoms.playlistCount.get(),
          delta
        )
      );
    },
    [playlistOpen]
  );

  const onPlaylistActivate = useCallback(() => {
    if (!playlistOpen) return;
    const count = playbackAtoms.playlistCount.get();
    const index = playlistFocus ?? playbackAtoms.playlistIndex.get();
    if (index < 0 || index >= count) return;
    ignore(onPlayIndex(index));
  }, [onPlayIndex, playlistFocus, playlistOpen]);

  const onToggleAutoHide = useCallback(() => {
    handleSetAutoHide(!playerAtoms.autoHide.get());
  }, [handleSetAutoHide]);

  const onToggleDiagnostics = useCallback(() => {
    setDiagnosticsOpen((value) => !value);
  }, []);

  const onToggleCheatsheet = useCallback(() => {
    setPanel((prev) => (prev === "cheatsheet" ? null : "cheatsheet"));
  }, []);

  const onTogglePlaylist = useCallback(() => {
    setPlaylistOpen((previous) => !previous);
  }, []);

  const onOpenJump = useCallback(() => {
    setJumpOpen(true);
  }, []);

  const onKeyboardAction = usePlayerKeyboardActions({
    onPlayPause,
    onSeekBy,
    onChapterJump,
    onVolume,
    onMute,
    onFrameStep,
    nudgeOffset,
    onResetDelays,
    onToggleAutoHide,
    onToggleDiagnostics,
    onToggleCheatsheet,
    onToggleFullscreen: toggleFullscreen,
    onToggleAlwaysOnTop: applyAlwaysOnTop,
    onViewMode: applyViewMode,
    onExitCinemaMode: exitCinemaMode,
    onFileNext,
    onFilePrev,
    onTogglePlaylist,
    onSkipShortcut,
    onSpeedStep,
    onCycleTrack,
    onSeekTo,
    onSeekPercent,
    onOpenJump,
    onPlaylistFocus,
    onPlaylistActivate,
  });

  const close = useCallback(() => {
    ignore(closePlayerWindow());
  }, []);

  const restart = useCallback(() => {
    setFinished(false);
    ignore(seekTo(0, "exact").then(() => setPaused(false)));
  }, []);

  // The menu memo needs stable values, and the hook returns a fresh object on
  // every render, so its fields are pulled out once.
  const {
    session: playerStreamSession,
    variants: playerStreamVariants,
    variantsLoading: playerStreamLoading,
    variantsFailed: playerStreamFailed,
    switching: playerStreamSwitching,
    switchVariant: switchStreamVariant,
    switchQuality: switchStreamQuality,
    reloadVariants: reloadStreamVariants,
  } = playerStream;

  const modernEntries = useMemo(() => {
    if (!showModernMenu) return [];
    return buildModernPlayerMenu(
      {
        hasFile,
        paused,
        tracks,
        chapters,
        playlistOpen,
        fullscreen,
        viewMode,
        alwaysOnTop,
        speed,
        eofMode,
        playerMode: settings.playerMode,
        cabinet: settings.cabinet,
        stream:
          playerStreamSession === null
            ? null
            : {
                session: playerStreamSession,
                variants: playerStreamVariants,
                variantsLoading: playerStreamLoading,
                variantsFailed: playerStreamFailed,
                switching: playerStreamSwitching,
              },
      },
      {
        onPlayPause,
        onFrameStep: (forward) => ignore(startFrameStep(forward)),
        onPrevFile: onFilePrev,
        onNextFile: onFileNext,
        onSelectAudio: onSelectTrack("audio"),
        onSelectSub: onSelectTrack("sub"),
        onSeekTo,
        onSpeed,
        onTogglePlaylist: () => setPlaylistOpen((previous) => !previous),
        onToggleFullscreen: () => ignore(toggleFullscreen()),
        onViewMode: applyViewMode,
        onToggleAlwaysOnTop: () => applyAlwaysOnTop(!alwaysOnTop),
        onEofMode: handleEofMode,
        onPlayerMode: (mode) => handlePatchSettings({ playerMode: mode }),
        onCabinet: (cabinet) => handlePatchSettings({ cabinet }),
        onOpenSettings: () => setPanel("settings"),
        onOpenCheatsheet: () => setPanel("cheatsheet"),
        onSelectVariant: (variant) => ignore(switchStreamVariant(variant)),
        onSelectQuality: (label) => ignore(switchStreamQuality(label)),
        onRetryVariants: reloadStreamVariants,
      }
    );
  }, [
    hasFile,
    paused,
    tracks,
    chapters,
    playlistOpen,
    fullscreen,
    viewMode,
    alwaysOnTop,
    speed,
    onPlayPause,
    onFilePrev,
    onFileNext,
    onSelectTrack,
    onSeekTo,
    onSpeed,
    toggleFullscreen,
    applyViewMode,
    applyAlwaysOnTop,
    handleEofMode,
    eofMode,
    settings.playerMode,
    settings.cabinet,
    handlePatchSettings,
    showModernMenu,
    playerStreamSession,
    playerStreamVariants,
    playerStreamLoading,
    playerStreamFailed,
    playerStreamSwitching,
    switchStreamVariant,
    switchStreamQuality,
    reloadStreamVariants,
  ]);

  const eofPaused = eofReached && (eofMode === "pause" || eofMode === "none");

  const cabinet = usePlayerScreen(ready, settings, hasFile);

  const videoWrap = (node: ReactNode): ReactNode =>
    wrapVideoMenu(node, showModernMenu, modernEntries, setMenuOpen);

  return (
    <div className={rootClass(hasFile, failed, cursorHidden)}>
      <Keyboard
        onAction={onKeyboardAction}
        onWheel={(direction) => onVolume(playerAtoms.volume.get() + direction * VOLUME_STEP)}
      />

      {chrome.showHeader && (
        <div className={barClass("top", immersive, barsHidden)}>
          <PlayerHeader
            title={title}
            cinema={cinema}
            fullscreen={fullscreen}
            onOpenSettings={() => setPanel("settings")}
            onToggleCinema={toggleCinema}
            onToggleFullscreen={() => ignore(toggleFullscreen())}
            onClose={close}
          />
        </div>
      )}

      <div className={videoSectionClass(immersive)}>
        <div className="flex h-full min-h-0 flex-row gap-1">
          {videoWrap(
            <div
              ref={videoRef}
              data-player-video=""
              className="relative min-h-0 flex-1 overflow-hidden"
              onClick={onVideoClick}
              onMouseDown={onVideoMouseDown}
              onMouseMove={onVideoMouseMove}
              onMouseUp={onVideoMouseUp}
              onContextMenu={showModernMenu ? undefined : (event) => event.preventDefault()}
            >
              {cabinet !== null && <PlayerBezel variant={cabinet} />}

              <OsdOverlay alwaysOnTop={alwaysOnTop} />
              <BufferingOverlay
                visible={hasFile && !failed && !loadingFile && pausedForCache === true}
              />
              {diagnosticsOpen && <DiagnosticsOverlay />}

              {dropAlert && (
                <div className="windows95-border windows95-font bg-primary/95 absolute top-4 left-4 z-20 p-2 text-left text-sm">
                  <span className="font-bold">
                    {t("player.media.watchdog.dropped", {
                      drops: dropAlert.drops,
                      percent: Math.round(dropAlert.ratio * 100),
                    })}
                  </span>
                </div>
              )}

              {shouldShowEmptyPlayer(hasFile, loadingFile, failed, hasShownFrame) && (
                <EmptyPlayer />
              )}

              {shouldShowLoadingSpinner(hasFile, loadingFile, failed, hasShownFrame) && (
                <div className="windows95-border bg-primary pointer-events-none absolute top-2 left-2 z-20 p-1">
                  <SmallLoader size={4} />
                </div>
              )}

              {hasFile && (
                <SkipButton
                  duration={duration}
                  chapters={chapters}
                  hasNext={hasNext}
                  raised={immersive}
                  onSkip={onSkipChapter}
                  onFileNext={onFileNext}
                />
              )}

              {jumpOpen && <JumpToTime onCommit={onSeekTo} onClose={() => setJumpOpen(false)} />}

              <PlayerStatus
                visible={hasFile}
                finished={finished}
                eofPaused={eofPaused}
                failed={failed}
                loading={loadingFile}
                hasNext={hasNext}
                onRestart={restart}
                onNext={onFileNext}
                onClose={close}
              />
            </div>
          )}

          {playlistOpen && (
            <PlayerSidePanel
              onMove={(from, to) => movePlaylistIndex(from, to)}
              onPlay={onPlayIndex}
              onRemove={(index) => removePlaylistIndex(index)}
              focusedIndex={playlistFocus}
            />
          )}
        </div>
      </div>

      <div className={barClass("bottom", immersive, barsHidden)}>
        <PlayerBottomBar
          variant={chrome.bottom}
          playerType={playerType}
          hasFile={hasFile}
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
          playlistOpen={playlistOpen}
          seekTarget={seekTarget ?? streamResume}
          onPlay={onPlay}
          onPause={onPause}
          onPlayPause={onPlayPause}
          onSeekTo={onSeekTo}
          onScrub={onScrub}
          onCommitSeek={onCommitSeek}
          onFilePrev={onFilePrev}
          onFileNext={onFileNext}
          onFrameStep={onFrameStep}
          onCycleSub={onCycleSub}
          onSpeed={onSpeed}
          onVolume={onVolume}
          onMute={onMute}
          onToggleAutoHide={() => handleSetAutoHide(!autoHide)}
          onTogglePlaylist={() => setPlaylistOpen((previous) => !previous)}
          hideTracks={hideDefaultTracks(playerType, playerContextMenu)}
          onSelectAudio={onSelectTrack("audio")}
          onSelectSub={onSelectTrack("sub")}
          onAddAudio={() => ignore(onAddExternalAudio())}
          onAddSubtitle={() => ignore(onAddExternalSubtitle())}
          stream={playerStream}
        />
      </div>

      <PlayerPanel
        panel={panel}
        settings={settings}
        hwdec={hwdec}
        seekMode={seekMode}
        eofMode={eofMode}
        autoHide={autoHide}
        profile={profile}
        streaming={stream !== null}
        onClose={() => setPanel(null)}
        onPatchSettings={handlePatchSettings}
        onHwdec={handleHwdec}
        onSeekMode={handleSeekMode}
        onEofMode={handleEofMode}
        onAutoHide={handleSetAutoHide}
        onProfile={handleProfile}
      />
    </div>
  );
}

export default PlayerComponent;
