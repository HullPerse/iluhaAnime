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
import { usePlayerOverlayState } from "@/hooks/player/overlayState.hook";
import { usePlayerPlaylistFocus } from "@/hooks/player/playlistFocus.hook";
import { usePlayerTransport } from "@/hooks/player/transport.hook";
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
import { useStreamRouteGuard } from "@/hooks/player/streamRoute.hook";
import { useStreamTrackPrefs } from "@/hooks/player/streamTrackPrefs.hook";
import { usePlayerTracks } from "@/hooks/player/tracks.hook";
import { usePlayerWatchProgress } from "@/hooks/player/watchProgress.hook";
import { scheduleTask } from "@/lib/core/shared.utils";
import { startsOnPlayerControl } from "@/lib/player/playerDrag.utils";
import {
  LOADING_TIMEOUT_MS,
  shouldShowEmptyPlayer,
  shouldShowLoadingSpinner,
} from "@/lib/core/loading.utils";
import {
  applyFileState,
  loadQueue,
  movePlaylistIndex,
  playPlaylistIndex,
  readPath,
  readDuration,
  removePlaylistIndex,
  seekTo,
  setPaused,
  startFrameStep,
} from "@/lib/player/playback.utils";
import {
  RESUME_END_MARGIN,
  RESUME_MIN,
  resolveLoadPosition,
  needsExactSeek,
  shouldSkipFrontendSeek,
} from "@/lib/player/resume.utils";
import type { HwdecReload } from "@/types/player/resume";
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
import {
  patchPlayerSettings,
  playbackAtoms,
  playerAtoms,
  resetPlayback,
  setAutoHide,
  setEofMode,
  setProfile,
  setSeekMode,
  streamSession,
  settleSeek,
} from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { PlayerSettings, PlayerViewMode } from "@/types/player/videoPlayer";

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

  const [cinema, setCinema] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<PlayerViewMode>("normal");
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [barsVisible, setBarsVisible] = useState<boolean>(true);
  const {
    panel,
    setPanel,
    jumpOpen,
    setJumpOpen,
    diagnosticsOpen,
    playlistOpen,
    setPlaylistOpen,
    menuOpen,
    setMenuOpen,
    playlistFocus,
    setPlaylistFocus,
    closeOverlay,
    onToggleDiagnostics,
    onToggleCheatsheet,
    onTogglePlaylist,
    onOpenJump,
  } = usePlayerOverlayState();
  const [finished, setFinished] = useState<boolean>(false);
  const [hasShownFrame, setHasShownFrame] = useState<boolean>(false);

  const resumeRef = useRef<number | undefined>(undefined);
  const hwdecReloadRef = useRef<HwdecReload | null>(null);
  const loadEpochRef = useRef<number>(0);

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
  const playerStream = usePlayerStream();
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
  const streamRoute = useStreamRouteGuard({ session: stream, setLoadingFile, setFailed });
  const { onSelectTrack, onCycleTrack, onAddExternalSubtitle, onAddExternalAudio } =
    usePlayerTracks();
  const {
    onPlay,
    onPause,
    onPlayPause,
    onFileNext,
    onFilePrev,
    onPlayIndex,
    onVolume,
    onMute,
    onSpeed,
    handleHwdec,
    onSpeedStep,
    onFrameStep,
    onCycleSub,
    restart,
    close,
  } = usePlayerTransport({
    setFinished,
    setLoadingFile,
    streamNext,
    streaming: stream !== null,
    onCycleTrack,
    hwdecReloadRef,
  });

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

  const retryPlayback = useCallback(() => {
    setFailed(false);
    if (stream !== null) {
      streamRoute.retryNow();
      return;
    }
    reloadPlayingFile();
  }, [reloadPlayingFile, setFailed, stream, streamRoute]);

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
      setFailed(false);
      setLoadingFile(true);
      if (request.stream) {
        streamSession.set(request.stream);
        return;
      }
      streamSession.set(null);
      resumeRef.current = request.resume;
      setLiveWatch(request.watch ?? null);
      ignore(loadQueue(request.files, request.resume, request.startIndex));
    },
    onFileLoaded: () => {
      ignore(handleFileLoaded());
    },
    onEndFile: (reason) => {
      setFinished(false);
      // mpv reports a failed open as end-file/error, not always as `error`.
      if (reason === "error" && streamSession.get() !== null) {
        streamRoute.failNow();
        return;
      }
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
      streamRoute.markPlaying();
      setHasShownFrame(true);
      setLoadingFile(false);
      syncMargins(true);
    },
    onShutdown: () => {
      resetPlayback();
    },
    onError: () => {
      // A stream can recover on its other route (direct against a lagging VPN),
      // so the guard decides whether this is fatal before the error screen.
      streamRoute.failNow();
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

  const handlePatchSettings = useCallback((patch: Partial<PlayerSettings>) => {
    patchPlayerSettings(patch);
  }, []);

  const { nudgeOffset, onResetDelays } = usePlayerOffsets();

  const { onPlaylistFocus, onPlaylistActivate } = usePlayerPlaylistFocus({
    playlistOpen,
    playlistFocus,
    setPlaylistFocus,
    onPlayIndex,
  });

  const onKeyboardAction = usePlayerKeyboardActions({
    onPlayPause,
    onSeekBy,
    onChapterJump,
    onVolume,
    onMute,
    onFrameStep,
    nudgeOffset,
    onResetDelays,
    onToggleAutoHide: () => setAutoHide(!playerAtoms.autoHide.get()),
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
        onEofMode: setEofMode,
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
    setPanel,
    setPlaylistOpen,
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
                streaming={stream !== null}
                onRestart={restart}
                onRetry={retryPlayback}
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
          onToggleAutoHide={() => setAutoHide(!autoHide)}
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
        onSeekMode={setSeekMode}
        onEofMode={setEofMode}
        onAutoHide={setAutoHide}
        onProfile={setProfile}
      />
    </div>
  );
}

export default PlayerComponent;
