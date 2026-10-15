import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import ContextMenu from "@/components/shared/contextMenu.component";
import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";
import {
  OFFSET_LIMIT,
  OFFSET_STEP,
  OFFSET_STEP_FINE,
  SEEK_STEP,
  type KeybindAction,
} from "@/config/player/keybinds.config";
import { VOLUME_STEP } from "@/config/player/video.config";
import { useI18n } from "@/hooks/i18n.hook";
import { usePlayerEvents } from "@/hooks/player/events.hook";
import { useLivePlaylistSync } from "@/hooks/player/liveSync.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { translate } from "@/lib/locale/i18n.utils";
import { fileNameFromPath } from "@/lib/media/parse.utils";
import { Debouncer } from "@/lib/pacer/debounce.utils";
import { createInterval } from "@/lib/pacer/interval.utils";
import { scheduleTask, type ScheduledTask } from "@/lib/pacer/shared.utils";
import { Throttler } from "@/lib/pacer/throttle.utils";
import { scheduleCardPrefetch, scheduleNeighborPrefetch } from "@/lib/player/cardCache.utils";
import {
  LOADING_TIMEOUT_MS,
  shouldShowEmptyPlayer,
  shouldShowLoadingSpinner,
} from "@/lib/player/loading.utils";
import {
  computeVideoMargins,
  marginOptions,
  marginsCloseEnough,
  ZERO_MARGINS,
  type VideoMargins,
} from "@/lib/player/margins.utils";
import {
  addExternalAudio,
  addExternalSubtitle,
  appendFiles,
  applyAudioOptions,
  applyColorOptions,
  applyFileState,
  applyHdrOptions,
  applyPlayerProfile,
  applyProperties,
  audioOptions,
  buildInitialOptions,
  closePlayerWindow,
  colorOptions,
  destroyPlayer,
  diffOptions,
  hdrOptions,
  initPlayer,
  type FilePlaybackState,
  loadQueue,
  movePlaylistIndex,
  nextFile,
  playPlaylistIndex,
  previousFile,
  readPath,
  readDuration,
  readPlaylistEntries,
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
import { movePlaylistFocus } from "@/lib/player/playlistFocus.utils";
import {
  RESUME_END_MARGIN,
  RESUME_MIN,
  resolveLoadPosition,
  needsExactSeek,
  shouldSkipFrontendSeek,
  type HwdecReload,
} from "@/lib/player/resume.utils";
import { resolveSkipTarget } from "@/lib/player/skip.utils";
import { resolveChapterJump, type ChapterJumpDirection } from "@/lib/player/chapter.utils";
import { stepSpeed } from "@/lib/player/speed.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { nextTrackId } from "@/lib/player/tracks.utils";
import { useCell } from "@/lib/state/signal.hook";
import { reportBackgroundError, withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { ignore } from "@/lib/utils/promise.utils";
import {
  getMediaEntry,
  hydrateMediaEntry,
  setMediaAudioOffset,
  setMediaPosition,
  setMediaSubOffset,
  setMediaTrack,
} from "@/store/media.store";
import { addNotification } from "@/store/notification.store";
import {
  getPlayerSnapshot,
  markTrackSelected,
  patchPlayerSettings,
  playbackAtoms,
  playerAtoms,
  resetPlayback,
  setAutoHide,
  setEofMode,
  setHwdec,
  setPlaybackMuted,
  setPlaybackPaused,
  setPlaybackSpeed,
  setProfile,
  setSeekMode,
  setSeekTarget,
  setVolume,
  settleSeek,
  subscribePlayer,
} from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type {
  DroppedFramesData,
  EndOfFileMode,
  HwdecMode,
  MediaEntry,
  MpvTrack,
  PlayerProfileId,
  PlayerSettings,
  PlaylistWatch,
  SeekMode,
} from "@/types/videoPlayer";

import Cheatsheet from "./media/cheatsheet.player";
import DiagnosticsOverlay from "./media/diagnostics.player";
import EmptyPlayer from "./media/empty.player";
import PlayerHeader from "./media/header.player";
import JumpToTime from "./media/jump.player";
import Keyboard from "./media/keyboard.player";
import PlayerModal from "./media/modal.player";
import OsdOverlay from "./media/offset.player";
import SettingsPanel from "./media/settings.player";
import SkipButton from "./media/skip.player";
import PlayerStatus from "./media/status.player";
import PlayerSidePanel from "./side.player";
import { buildModernPlayerMenu } from "./modern/menu.modern";
import PlayerBottomBar from "./modern/bottom.modern";

const AUTO_HIDE_DELAY = 3000;
const WATCH_INTERVAL = 5000;
const DROP_TOAST_TIMEOUT = 6000;
const SETTINGS_FLUSH_MS = 120;
const SUBTITLE_FILTERS = ["srt", "ass", "ssa", "vtt", "sub", "idx"];
const AUDIO_FILTERS = ["mka", "flac", "aac", "m4a", "ac3", "dts", "mp3", "wav", "ogg", "opus"];

function barClass(position: "top" | "bottom", immersive: boolean, hidden: boolean): string {
  if (!immersive) return "z-20 shrink-0 bg-primary";
  return cn(
    "bg-primary/90 absolute inset-x-0 z-20 shrink-0 transition-opacity duration-300",
    position === "top" ? "top-0" : "bottom-0",
    hidden && "pointer-events-none opacity-0"
  );
}

function videoSectionClass(immersive: boolean): string {
  if (immersive) return "relative min-h-0 flex-1 overflow-hidden";
  return "relative m-1 min-h-0 flex-1 overflow-hidden windows95-active-border";
}

interface CursorHiddenState {
  barsHidden: boolean;
  panelOpen: boolean;
  jumpOpen: boolean;
  diagnosticsOpen: boolean;
  playlistOpen: boolean;
  menuOpen: boolean;
  dropAlert: DroppedFramesData | null;
}

function shouldHideCursor(state: CursorHiddenState): boolean {
  return (
    state.barsHidden &&
    !state.panelOpen &&
    !state.jumpOpen &&
    !state.diagnosticsOpen &&
    !state.playlistOpen &&
    !state.menuOpen &&
    state.dropAlert === null
  );
}

function rootClass(hasFile: boolean, failed: boolean, cursorHidden: boolean): string {
  return cn(
    "relative flex h-screen w-screen flex-col overflow-hidden",
    (!hasFile || failed) && "bg-black",
    cursorHidden && "player-cursor-hidden"
  );
}

async function restoreReloadPaused(reload: HwdecReload | null): Promise<void> {
  if (reload && !reload.paused) await setPaused(false);
}

function fileStatePatch(entry: MediaEntry | undefined, speed: number): FilePlaybackState {
  return {
    speed,
    subDelay: entry?.subOffset ?? 0,
    audioDelay: entry?.audioOffset ?? 0,
    audioTrack: typeof entry?.audioTrack === "number" ? entry.audioTrack : undefined,
    subtitleTrack: typeof entry?.subtitleTrack === "number" ? entry.subtitleTrack : undefined,
  };
}

function modernMenuEnabled(playerType: "default" | "modern", contextMenu: boolean): boolean {
  return playerType === "modern" || contextMenu;
}

function hideDefaultTracks(playerType: "default" | "modern", contextMenu: boolean): boolean {
  return playerType === "default" && contextMenu;
}

function resolveBarsHidden(
  immersive: boolean,
  autoHide: boolean,
  barsVisible: boolean,
  menuOpen: boolean
): boolean {
  return immersive && autoHide && !barsVisible && !menuOpen;
}

function wrapVideoMenu(
  node: ReactNode,
  enabled: boolean,
  entries: ContextMenuEntry[],
  onOpenChange: (open: boolean) => void
): ReactNode {
  if (!enabled) return node;
  return (
    <ContextMenu entries={entries} onOpenChange={onOpenChange}>
      {node}
    </ContextMenu>
  );
}

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

  const eofMode = useCell(playerAtoms.eofMode);
  const hwdec = useCell(playerAtoms.hwdec);
  const seekMode = useCell(playerAtoms.seekMode);
  const volume = useCell(playerAtoms.volume);
  const autoHide = useCell(playerAtoms.autoHide);
  const profile = useCell(playerAtoms.profile);
  const settings = useCell(playerAtoms.settings);
  const playerType = useCell(settingsAtoms.playerType);
  const playerContextMenu = useCell(settingsAtoms.playerContextMenu);
  const showModernMenu = modernMenuEnabled(playerType, playerContextMenu);

  const [cinema, setCinema] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [barsVisible, setBarsVisible] = useState(true);
  const [panel, setPanel] = useState<null | "settings" | "cheatsheet">(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistFocus, setPlaylistFocus] = useState<number | null>(null);
  const [dropAlert, setDropAlert] = useState<DroppedFramesData | null>(null);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [hasShownFrame, setHasShownFrame] = useState(false);
  const [liveWatch, setLiveWatch] = useState<PlaylistWatch | null>(null);

  const videoRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<number | undefined>(undefined);
  const hwdecReloadRef = useRef<HwdecReload | null>(null);
  const loadEpochRef = useRef(0);
  const destroyTaskRef = useRef<ScheduledTask | null>(null);
  const dropHideRef = useRef<Debouncer<[]> | null>(null);
  const lastSavedWatchRef = useRef<{ path: string; position: number } | null>(null);

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
  }, []);

  useLivePlaylistSync(liveWatch, { onPlayingFileModified: reloadPlayingFile });

  const immersive = cinema || fullscreen;
  const hasNext = playlistCount > 0 && playlistIndex < playlistCount - 1;
  const hasPrev = playlistIndex > 0;
  const barsHidden = resolveBarsHidden(immersive, autoHide, barsVisible, menuOpen);
  const cursorHidden = shouldHideCursor({
    barsHidden,
    panelOpen: panel !== null,
    jumpOpen,
    diagnosticsOpen,
    playlistOpen,
    menuOpen,
    dropAlert,
  });
  const title = path
    ? parseTitlesPlayer
      ? formatParsedTitle(path, t)
      : fileNameFromPath(path)
    : t("player.media.title");

  const hideDropSoon = useCallback(() => {
    if (dropHideRef.current === null) {
      dropHideRef.current = new Debouncer(() => setDropAlert(null), {
        wait: DROP_TOAST_TIMEOUT,
      });
    }
    dropHideRef.current.maybeExecute();
  }, []);

  const marginsTaskRef = useRef<ScheduledTask | null>(null);
  const lastMarginsRef = useRef<VideoMargins | null>(null);

  const readMargins = useCallback((): VideoMargins => {
    const rect = videoRef.current?.getBoundingClientRect();
    return computeVideoMargins(window.innerWidth || 1, window.innerHeight || 1, rect ?? undefined);
  }, []);

  const measureMargins = useCallback(
    (): VideoMargins => (immersive ? { ...ZERO_MARGINS } : readMargins()),
    [immersive, readMargins]
  );

  const sendMargins = useCallback((next: VideoMargins, force: boolean) => {
    if (!force && lastMarginsRef.current && marginsCloseEnough(lastMarginsRef.current, next)) {
      return;
    }
    if (!playbackAtoms.ready.get()) {
      lastMarginsRef.current = null;
      return;
    }
    ignore(
      setVideoMarginRatio(next)
        .then(() => {
          lastMarginsRef.current = next;
        })
        .catch((error: unknown) => {
          lastMarginsRef.current = null;
          reportBackgroundError("player.margins", error);
        })
    );
  }, []);

  const syncMargins = useCallback(
    (force = false) => {
      marginsTaskRef.current?.cancel();
      marginsTaskRef.current = scheduleTask("raf", 0, () => {
        sendMargins(measureMargins(), force);
      });
    },
    [measureMargins, sendMargins]
  );

  const syncMarginsRef = useRef(syncMargins);
  useEffect(() => {
    syncMarginsRef.current = syncMargins;
  }, [syncMargins]);

  const VOLUME_IPC_MS = 150;
  const volumeThrottlerRef = useRef<Throttler<[number]> | null>(null);

  const sendVolumeNow = useCallback((value: number) => {
    setMpvProperty("volume", Math.round(value * 100)).catch((error: unknown) =>
      reportBackgroundError("player.settings.volume", error)
    );
  }, []);

  const sendVolumeThrottled = useCallback(
    (value: number) => {
      if (volumeThrottlerRef.current === null) {
        volumeThrottlerRef.current = new Throttler(sendVolumeNow, { wait: VOLUME_IPC_MS });
      }
      volumeThrottlerRef.current.maybeExecute(value);
    },
    [sendVolumeNow]
  );

  useEffect(() => {
    if (destroyTaskRef.current !== null) {
      destroyTaskRef.current.cancel();
      destroyTaskRef.current = null;
    }
    let disposed = false;

    const start = async () => {
      const store = getPlayerSnapshot();
      const field = videoRef.current?.getBoundingClientRect();
      const seedMargins = computeVideoMargins(
        window.innerWidth || 1,
        window.innerHeight || 1,
        field ?? undefined
      );
      await initPlayer({
        ...buildInitialOptions({
          volume: store.volume,
          hwdec: store.hwdec,
          settings: store.settings,
        }),
        ...marginOptions(seedMargins),
      });
      await Promise.all([
        applyPlayerProfile(store.profile).catch((error: unknown) =>
          reportBackgroundError("player.init.profile", error)
        ),
        applyHdrOptions(store.settings).catch((error: unknown) =>
          reportBackgroundError("player.init.hdr", error)
        ),
        applyColorOptions(store.settings).catch((error: unknown) =>
          reportBackgroundError("player.init.color", error)
        ),
        applyAudioOptions(store.settings).catch((error: unknown) =>
          reportBackgroundError("player.init.audio", error)
        ),
        setEofModeCommand(store.eofMode),
      ]);
      if (disposed) return;
      syncMarginsRef.current(true);
      const request = await takePendingOpen();
      if (disposed) return;
      if (request && request.files.length > 0) {
        resumeRef.current = request.resume;
        setLiveWatch(request.watch ?? null);
        setLoadingFile(true);
        await loadQueue(request.files, request.resume, request.startIndex);
      }
    };

    start().catch((error: unknown) => {
      setFailed(true);
      addNotification(
        translate(settingsAtoms.language.get(), "player.media.error.title"),
        "error",
        String(error)
      );
    });

    return () => {
      disposed = true;
      const task = scheduleTask("timeout", 0, () => {
        destroyTaskRef.current = null;
        ignore(destroyPlayer());
      });
      destroyTaskRef.current = task;
    };
  }, []);

  const settingsDebouncerRef = useRef<Debouncer<[PlayerSettings]> | null>(null);
  const previousSettingsRef = useRef<PlayerSettings | null>(null);
  const settingsSyncFailedRef = useRef(false);

  useEffect(() => {
    return () => {
      settingsDebouncerRef.current?.cancel();
      volumeThrottlerRef.current?.cancel();
      marginsTaskRef.current?.cancel();
      dropHideRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    let previous = getPlayerSnapshot();
    return subscribePlayer(() => {
      const state = getPlayerSnapshot();
      if (state.volume !== previous.volume) {
        sendVolumeThrottled(state.volume);
      }
      if (state.profile !== previous.profile) {
        applyPlayerProfile(state.profile).catch((error: unknown) =>
          reportBackgroundError("player.settings.profile", error)
        );
      }
      if (state.settings !== previous.settings) {
        if (settingsDebouncerRef.current === null) {
          settingsDebouncerRef.current = new Debouncer(
            (latest: PlayerSettings) => {
              const baseline = previousSettingsRef.current;
              const full = settingsSyncFailedRef.current || baseline === null;
              previousSettingsRef.current = latest;
              const reference = baseline ?? latest;
              const groups: Array<[Record<string, unknown>, Record<string, unknown>]> = [
                [transformOptions(reference), transformOptions(latest)],
                [hdrOptions(reference), hdrOptions(latest)],
                [colorOptions(reference), colorOptions(latest)],
                [audioOptions(reference), audioOptions(latest)],
              ];
              const jobs: Array<Promise<string[]>> = [];
              for (const [prevOptions, nextOptions] of groups) {
                const options = full ? nextOptions : diffOptions(prevOptions, nextOptions);
                if (Object.keys(options).length > 0) jobs.push(applyProperties(options));
              }
              if (jobs.length === 0) {
                settingsSyncFailedRef.current = false;
                return;
              }
              ignore(
                Promise.all(jobs).then((failedLists) => {
                  settingsSyncFailedRef.current = failedLists.some((list) => list.length > 0);
                })
              );
            },
            { wait: SETTINGS_FLUSH_MS }
          );
        }
        settingsDebouncerRef.current.maybeExecute(state.settings);
      }
      if (state.eofMode !== previous.eofMode) {
        setEofModeCommand(state.eofMode).catch((error: unknown) =>
          reportBackgroundError("player.settings.eof", error)
        );
      }
      previous = state;
    });
  }, [sendVolumeThrottled]);

  const handleFileLoaded = useCallback(async () => {
    loadEpochRef.current += 1;
    const epoch = loadEpochRef.current;
    const isCurrent = () => loadEpochRef.current === epoch;
    setFinished(false);
    const loaded = await readPath();
    if (!loaded || !isCurrent()) return;
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
  }, []);

  usePlayerEvents({
    onOpenRequest: (request) => {
      if (request.files.length === 0) return;
      loadEpochRef.current += 1;
      resumeRef.current = request.resume;
      setLiveWatch(request.watch ?? null);
      setFinished(false);
      setLoadingFile(true);
      ignore(loadQueue(request.files, request.resume, request.startIndex));
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
      setDropAlert(data);
      hideDropSoon();
    },
  });

  useEffect(() => {
    if (!loadingFile) return;
    const task = scheduleTask("timeout", LOADING_TIMEOUT_MS, () => setLoadingFile(false));
    return () => task.cancel();
  }, [loadingFile]);

  useEffect(() => {
    const { cancel } = createInterval(() => {
      const path = playbackAtoms.path.get();
      const paused = playbackAtoms.paused.get();
      const eofReached = playbackAtoms.eofReached.get();
      const duration = playbackAtoms.duration.get();
      if (!path || paused || eofReached || duration <= 0) {
        return;
      }
      const timePos = playbackAtoms.timePos.get();
      const lastSaved = lastSavedWatchRef.current;
      if (lastSaved && lastSaved.path === path && lastSaved.position === timePos) {
        return;
      }
      lastSavedWatchRef.current = { path, position: timePos };
      const entry = getMediaEntry(path);
      setMediaPosition(path, timePos, duration);
      ignore(
        saveWatch(path, {
          position: timePos,
          duration,
          subDelay: entry?.subOffset ?? 0,
          audioDelay: entry?.audioOffset ?? 0,
          updatedAt: Math.floor(Date.now() / 1000),
        })
      );
    }, WATCH_INTERVAL);
    return cancel;
  }, []);

  useEffect(() => {
    if (!path || playlistCount === 0) return;
    let cancelled = false;
    const index = playlistIndex;
    ignore(
      readPlaylistEntries().then((entries) => {
        if (cancelled) return;
        const filenames = entries.map((entry) => entry.filename);
        if (playlistOpen) scheduleCardPrefetch(filenames, path);
        else scheduleNeighborPrefetch(filenames, path, index);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [path, playlistCount, playlistIndex, playlistOpen]);

  useTauriEvent<{ paths: string[] }>(
    "tauri://drag-drop",
    (event) => {
      const extensions = settingsAtoms.videoExtensions.get();
      const lowerEndsWith = (path: string, list: readonly string[]) => {
        const lower = path.toLowerCase();
        return list.some((extension) => lower.endsWith(`.${extension.toLowerCase()}`));
      };
      const files = event.payload.paths.filter((path) => lowerEndsWith(path, extensions));
      if (files.length > 0) ignore(appendFiles(files));
      const subs = event.payload.paths.filter((path) => lowerEndsWith(path, SUBTITLE_FILTERS));
      const audios = event.payload.paths.filter((path) => lowerEndsWith(path, AUDIO_FILTERS));
      for (const sub of subs) {
        ignore(
          addExternalSubtitle(sub).catch((error: unknown) =>
            reportBackgroundError("player.subtitles.drop", error)
          )
        );
      }
      for (const audio of audios) {
        ignore(
          addExternalAudio(audio).catch((error: unknown) =>
            reportBackgroundError("player.audio.drop", error)
          )
        );
      }
    },
    { errorTag: "drag-drop" }
  );

  useEffect(() => {
    const element = videoRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => syncMargins());
    observer.observe(element);
    return () => observer.disconnect();
  }, [syncMargins]);

  useEffect(() => {
    const win = getCurrentWindow();
    ignore(win.isFullscreen().then(setFullscreen));

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
    const hide = new Debouncer<[]>(() => setBarsVisible(false), { wait: AUTO_HIDE_DELAY });
    hide.maybeExecute();
    const wake = () => {
      setBarsVisible(true);
      hide.maybeExecute();
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      hide.cancel();
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, [autoHide]);

  const toggleFullscreen = useCallback(async () => {
    const win = getCurrentWindow();
    const next = !(await withFallback(win.isFullscreen(), fullscreen));
    await withFallback(win.setFullscreen(next), undefined);
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
    if (panel !== null) {
      setPanel(null);
      return;
    }
    if (jumpOpen) {
      setJumpOpen(false);
      return;
    }
    ignore(
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
    );
  }, [cinema, diagnosticsOpen, jumpOpen, panel, playlistOpen]);

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
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("button, a, input, select, textarea, [role=button], [role=dialog]")) {
        return;
      }
      if (!playbackAtoms.hasFile.get()) return;
      if (loadingFile) return;
      onPlayPause();
    },
    [loadingFile, onPlayPause]
  );

  const onScrub = useCallback((time: number) => {
    setSeekTarget(time);
    ignore(seekTo(time, "keyframes"));
  }, []);

  const onCommitSeek = useCallback((time: number) => {
    setSeekTarget(time);
    ignore(seekTo(time, "exact"));
  }, []);

  const onSeekTo = useCallback((time: number) => {
    setSeekTarget(time);
    const mode = playerAtoms.seekMode.get();
    ignore(seekTo(time, mode));
  }, []);

  const onSeekBy = useCallback((seconds: number) => {
    const duration = playbackAtoms.duration.get();
    const timePos = playbackAtoms.timePos.get();
    const mode = playerAtoms.seekMode.get();
    const target = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, timePos + seconds));
    setSeekTarget(target);
    ignore(seekTo(target, mode));
  }, []);

  const onSkipChapter = useCallback((time: number) => {
    setSeekTarget(time);
    const mode = playerAtoms.seekMode.get();
    ignore(seekTo(time, mode).then(() => setPaused(false)));
  }, []);

  const onFileNext = useCallback(() => {
    setFinished(false);
    setLoadingFile(true);
    ignore(nextFile());
  }, []);

  const onFilePrev = useCallback(() => {
    setFinished(false);
    setLoadingFile(true);
    ignore(previousFile());
  }, []);

  const onPlayIndex = useCallback((index: number) => {
    setLoadingFile(true);
    return playPlaylistIndex(index);
  }, []);

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

  const handleHwdec = useCallback((mode: HwdecMode) => {
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
  }, []);

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

  const persistTrack = useCallback((track: MpvTrack, kind: "audio" | "sub") => {
    const current = playbackAtoms.path.get();
    if (current) setMediaTrack(current, kind, track.id);
  }, []);

  const onResetDelays = useCallback(() => {
    const current = playbackAtoms.path.get();
    if (!current) return;
    setMediaSubOffset(current, 0);
    setMediaAudioOffset(current, 0);
    ignore(setMpvProperty("sub-delay", 0));
    ignore(setMpvProperty("audio-delay", 0));
  }, []);

  const onSelectTrack = useCallback(
    (kind: "audio" | "sub") => (id: number | "no") => {
      const tracks = playbackAtoms.tracks.get();
      const previous = tracks;
      markTrackSelected(kind, id);
      selectTrack(kind, id).catch(() => playbackAtoms.tracks.set(previous));
      if (typeof id === "number") {
        const track = playbackAtoms.tracks.get().find((entry) => entry.id === id);
        if (track) persistTrack(track, kind);
      }
    },
    [persistTrack]
  );

  const pickFiles = useCallback(
    async (extensions: string[]): Promise<string[]> => {
      const selection = await withFallback(
        openDialog({
          multiple: true,
          filters: [{ name: t("player.media.tracks.external.filter"), extensions }],
        }),
        null
      );
      if (!selection) return [];
      return Array.isArray(selection) ? selection : [selection];
    },
    [t]
  );

  const onAddExternalSubtitle = useCallback(async () => {
    const files = await pickFiles(SUBTITLE_FILTERS);
    for (const file of files) await addExternalSubtitle(file);
  }, [pickFiles]);

  const onAddExternalAudio = useCallback(async () => {
    const files = await pickFiles(AUDIO_FILTERS);
    for (const file of files) await addExternalAudio(file);
  }, [pickFiles]);

  const nudgeOffset = useCallback((kind: "sub" | "audio", direction: number, fine: boolean) => {
    const current = playbackAtoms.path.get();
    if (!current) return;
    const entry = getMediaEntry(current);
    const base = (kind === "sub" ? entry?.subOffset : entry?.audioOffset) ?? 0;
    const step = fine ? OFFSET_STEP_FINE : OFFSET_STEP;
    const next = Math.max(
      -OFFSET_LIMIT,
      Math.min(OFFSET_LIMIT, Number((base + direction * step).toFixed(3)))
    );
    if (kind === "sub") setMediaSubOffset(current, next);
    else setMediaAudioOffset(current, next);
    if (kind === "sub") ignore(setMpvProperty("sub-delay", next));
    else ignore(setMpvProperty("audio-delay", next));
  }, []);

  const onSpeedStep = useCallback(
    (direction: number) => {
      onSpeed(stepSpeed(playbackAtoms.speed.get(), direction));
    },
    [onSpeed]
  );

  const onSeekPercent = useCallback(
    (percent: number) => {
      const total = playbackAtoms.duration.get();
      if (total <= 0) return;
      onSeekTo(total * (percent / 10));
    },
    [onSeekTo]
  );

  const onSkipShortcut = useCallback(() => {
    const skip = resolveSkipTarget(
      playbackAtoms.chapters.get(),
      playbackAtoms.timePos.get(),
      playbackAtoms.duration.get(),
      hasNext
    );
    if (!skip) return;
    onSkipChapter(skip.target);
    if (skip.nextEpisode) onFileNext();
  }, [hasNext, onFileNext, onSkipChapter]);

  const onChapterJump = useCallback(
    (direction: ChapterJumpDirection) => {
      const jump = resolveChapterJump({
        chapters: playbackAtoms.chapters.get(),
        timePos: playbackAtoms.timePos.get(),
        duration: playbackAtoms.duration.get(),
        hasPrev,
        hasNext,
        direction,
        step: SEEK_STEP,
      });
      if (jump.kind === "seek") onSeekTo(jump.time);
    },
    [hasPrev, hasNext, onSeekTo]
  );

  const onCycleTrack = useCallback(
    (kind: "audio" | "sub") => {
      const id = nextTrackId(playbackAtoms.tracks.get(), kind);
      if (id === null) return;
      onSelectTrack(kind)(id);
    },
    [onSelectTrack]
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

  const onKeyboardAction = useCallback(
    (action: KeybindAction) => {
      const actions: Record<KeybindAction, () => void> = {
        playPause: () => onPlayPause(),
        seekForward: () => onSeekBy(SEEK_STEP),
        seekBackward: () => onSeekBy(-SEEK_STEP),
        prevChapter: () => onChapterJump(-1),
        nextChapter: () => onChapterJump(1),
        volumeUp: () => onVolume(playerAtoms.volume.get() + VOLUME_STEP),
        volumeDown: () => onVolume(playerAtoms.volume.get() - VOLUME_STEP),
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
        resetDelays: () => onResetDelays(),
        toggleAutoHide: () => handleSetAutoHide(!playerAtoms.autoHide.get()),
        toggleDiagnostics: () => setDiagnosticsOpen((value) => !value),
        nextFile: () => onFileNext(),
        prevFile: () => onFilePrev(),
        toggleCheatsheet: () => setPanel((prev) => (prev === "cheatsheet" ? null : "cheatsheet")),
        toggleFullscreen: () => ignore(toggleFullscreen()),
        jumpToTime: () => setJumpOpen(true),
        exitCinemaMode: () => exitCinemaMode(),
        saveCleanFrame: () => {
          ignore(
            invokeTyped<{ path: string }>("player_save_frame").then(
              (saved) => {
                addNotification(
                  translate(settingsAtoms.language.get(), "player.media.frame.saved"),
                  "success",
                  saved.path
                );
              },
              (error: unknown) => {
                reportBackgroundError("player.frame.save", error);
              }
            )
          );
        },
        togglePlaylist: () => setPlaylistOpen((previous) => !previous),
        skipChapter: () => onSkipShortcut(),
        speedDown: () => onSpeedStep(-1),
        speedUp: () => onSpeedStep(1),
        speedReset: () => onSpeedStep(0),
        cycleSubtitle: () => onCycleTrack("sub"),
        cycleAudio: () => onCycleTrack("audio"),
        seekToStart: () => onSeekTo(0),
        seekToEnd: () => onSeekTo(playbackAtoms.duration.get()),
        seekPercent0: () => onSeekPercent(0),
        seekPercent1: () => onSeekPercent(1),
        seekPercent2: () => onSeekPercent(2),
        seekPercent3: () => onSeekPercent(3),
        seekPercent4: () => onSeekPercent(4),
        seekPercent5: () => onSeekPercent(5),
        seekPercent6: () => onSeekPercent(6),
        seekPercent7: () => onSeekPercent(7),
        seekPercent8: () => onSeekPercent(8),
        seekPercent9: () => onSeekPercent(9),
        playlistDown: () => onPlaylistFocus(1),
        playlistUp: () => onPlaylistFocus(-1),
        playlistActivate: () => onPlaylistActivate(),
      };
      actions[action]();
    },
    [
      exitCinemaMode,
      handleSetAutoHide,
      nudgeOffset,
      onChapterJump,
      onCycleTrack,
      onFileNext,
      onFilePrev,
      onMute,
      onPlayPause,
      onPlaylistActivate,
      onPlaylistFocus,
      onResetDelays,
      onSeekBy,
      onSeekPercent,
      onSeekTo,
      onSkipShortcut,
      onSpeedStep,
      onVolume,
      toggleFullscreen,
    ]
  );

  const close = useCallback(() => {
    ignore(closePlayerWindow());
  }, []);

  const restart = useCallback(() => {
    setFinished(false);
    ignore(seekTo(0, "exact").then(() => setPaused(false)));
  }, []);

  const modernEntries = useMemo(() => {
    if (!showModernMenu) return [];
    return buildModernPlayerMenu(
      { hasFile, paused, tracks, chapters, playlistOpen, fullscreen, speed, eofMode },
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
        onEofMode: handleEofMode,
        onOpenSettings: () => setPanel("settings"),
        onOpenCheatsheet: () => setPanel("cheatsheet"),
      }
    );
  }, [
    hasFile,
    paused,
    tracks,
    chapters,
    playlistOpen,
    fullscreen,
    speed,
    onPlayPause,
    onFilePrev,
    onFileNext,
    onSelectTrack,
    onSeekTo,
    onSpeed,
    toggleFullscreen,
    handleEofMode,
    eofMode,
    showModernMenu,
  ]);

  const eofPaused = eofReached && (eofMode === "pause" || eofMode === "none");

  const videoWrap = (node: ReactNode): ReactNode =>
    wrapVideoMenu(node, showModernMenu, modernEntries, setMenuOpen);

  return (
    <div className={rootClass(hasFile, failed, cursorHidden)}>
      <Keyboard
        onAction={onKeyboardAction}
        onWheel={(direction) => onVolume(playerAtoms.volume.get() + direction * VOLUME_STEP)}
      />

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

      <div className={videoSectionClass(immersive)}>
        <div className="flex h-full min-h-0 flex-row gap-1">
          {videoWrap(
          <div
            ref={videoRef}
            className="relative min-h-0 flex-1 overflow-hidden"
            onClick={onVideoClick}
            onContextMenu={showModernMenu ? undefined : (event) => event.preventDefault()}
          >
            <OsdOverlay />
            {diagnosticsOpen ? <DiagnosticsOverlay /> : null}

            {dropAlert ? (
              <div className="windows95-border windows95-font bg-primary/95 absolute top-4 left-4 z-20 p-2 text-left text-sm">
                <span className="font-bold">
                  {t("player.media.watchdog.dropped", {
                    drops: dropAlert.drops,
                    percent: Math.round(dropAlert.ratio * 100),
                  })}
                </span>
              </div>
            ) : null}

            {shouldShowEmptyPlayer(hasFile, loadingFile, failed, hasShownFrame) ? (
              <EmptyPlayer />
            ) : null}

            {shouldShowLoadingSpinner(hasFile, loadingFile, failed, hasShownFrame) ? (
              <div className="windows95-border bg-primary pointer-events-none absolute top-2 left-2 z-20 p-1">
                <SmallLoader size={4} />
              </div>
            ) : null}

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
              <JumpToTime onCommit={onSeekTo} onClose={() => setJumpOpen(false)} />
            ) : null}

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

          {playlistOpen ? (
            <PlayerSidePanel
              onMove={(from, to) => movePlaylistIndex(from, to)}
              onPlay={onPlayIndex}
              onRemove={(index) => removePlaylistIndex(index)}
              focusedIndex={playlistFocus}
            />
          ) : null}
        </div>
      </div>

      <div className={barClass("bottom", immersive, barsHidden)}>
        <PlayerBottomBar
          playerType={playerType}
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
          seekTarget={seekTarget}
          onPlay={onPlay}
          onPause={onPause}
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
        />
      </div>

      {panel !== null ? (
        <PlayerModal
          header={t(
            panel === "settings" ? "player.media.panel.settings" : "player.media.panel.cheatsheet"
          )}
          className="w-xl"
          onClose={() => setPanel(null)}
        >
          {panel === "settings" ? (
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
          ) : (
            <Cheatsheet />
          )}
        </PlayerModal>
      ) : null}
    </div>
  );
}

export default PlayerComponent;
