import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { StreamRouteGuard } from "@/hooks/player/streamRoute.hook";
import {
  applyFileState,
  applyFileTracks,
  playPlaylistIndex,
  readDuration,
  readPath,
  seekTo,
  setPaused,
  setMpvProperty,
} from "@/lib/player/playback.utils";
import { fileStatePatch, restoreLoadedPause } from "@/lib/player/playerChrome.utils";
import {
  RESUME_END_MARGIN,
  RESUME_MIN,
  needsExactSeek,
  resolveLoadPosition,
  shouldSkipFrontendSeek,
} from "@/lib/player/resume.utils";
import { loadSidecarTracks } from "@/lib/player/sidecar.utils";
import { loadStreamSubtitles } from "@/lib/player/streamSubtitles.utils";
import { measurePlayerStartup, recordPlayerControlsReady } from "@/lib/player/startup.utils";
import { preferredLanguageTrackId, resolveTrackId } from "@/lib/player/trackIdentity.utils";
import { hydrateMediaEntry } from "@/store/media.store";
import {
  playerAtoms,
  playbackAtoms,
  seedTrackSelection,
  streamSession,
} from "@/store/player.store";
import type { FilePlaybackState } from "@/types/player/playback";
import type { HwdecReload } from "@/types/player/resume";
import type { StreamOpen, WatchState } from "@/types/player/videoPlayer";

type LoadedMediaEntry = Awaited<ReturnType<typeof hydrateMediaEntry>>;

function watchDuration(entry: LoadedMediaEntry): number {
  return entry && entry.duration > 0 ? entry.duration : 0;
}

async function resolveLiveDuration(hint: number, position: number): Promise<number> {
  if (hint > 0) return hint;

  return position > 0 ? await readDuration() : 0;
}

async function seekToSavedPosition(
  position: number,
  reload: HwdecReload | null,
  resume: number | undefined,
  liveDuration: number
): Promise<void> {
  const inside =
    position > RESUME_MIN && (liveDuration <= 0 || position < liveDuration - RESUME_END_MARGIN);

  if (position > 0) {
    playbackAtoms.seekTarget.set(position);
    playbackAtoms.seekSettle.set(false);
  }

  if (!shouldSkipFrontendSeek(reload, resume, position)) {
    if (needsExactSeek(reload, position, inside)) await seekTo(position, "exact");
  }
}

async function applyRestoredTracks(state: FilePlaybackState, loaded: string): Promise<void> {
  const tracks = playbackAtoms.tracks.get();
  const settings = playerAtoms.settings.get();
  const audioTrack =
    resolveTrackId(tracks, "audio", state.audioTrack, state.audioTrackKey) ??
    (state.audioTrackKey
      ? undefined
      : preferredLanguageTrackId(tracks, "audio", settings.audioLanguage));
  const subtitleTrack =
    state.subtitleTrack === "no"
      ? "no"
      : (resolveTrackId(tracks, "sub", state.subtitleTrack, state.subtitleTrackKey) ??
        (state.subtitleTrackKey
          ? undefined
          : preferredLanguageTrackId(tracks, "sub", settings.subtitleLanguage)));

  if (audioTrack === undefined && subtitleTrack === undefined) return;
  const [, failure] = await attempt(applyFileTracks({ audioTrack, subtitleTrack }, loaded));

  if (failure) {
    seedTrackSelection({});
    reportBackgroundError("player.file-tracks", failure);
  }
}

interface PlayerFileLoadDeps {
  stream: StreamOpen | null;
  streamRoute: StreamRouteGuard;
  syncMarginsRef: RefObject<(force?: boolean) => void>;
  resumeRef: RefObject<number | undefined>;
  initialWatchRef: RefObject<WatchState | null | undefined>;
  hwdecReloadRef: RefObject<HwdecReload | null>;
  loadEpochRef: RefObject<number>;
  setFinished: (value: boolean) => void;
  setLoadingFile: (value: boolean) => void;
  setFailed: (value: boolean) => void;
  setFileReady: (ready: boolean) => void;
}

export function usePlayerFileLoad({
  stream,
  streamRoute,
  syncMarginsRef,
  resumeRef,
  initialWatchRef,
  hwdecReloadRef,
  loadEpochRef,
  setFinished,
  setLoadingFile,
  setFailed,
  setFileReady,
}: PlayerFileLoadDeps) {
  const previousFileRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      loadEpochRef.current += 1;
    },
    [loadEpochRef]
  );
  const reloadPlayingFile = useCallback(() => {
    const playlistIndex = playbackAtoms.playlistIndex.get();

    if (!playbackAtoms.hasFile.get() || playlistIndex < 0) return;
    hwdecReloadRef.current = {
      position: playbackAtoms.timePos.get(),
      paused: playbackAtoms.paused.get(),
    };
    setLoadingFile(true);
    ignore(setPaused(true));
    playPlaylistIndex(playlistIndex).catch((error: unknown) => {
      hwdecReloadRef.current = null;
      setLoadingFile(false);
      reportBackgroundError("player.reload", error);
    });
  }, [hwdecReloadRef, setLoadingFile]);

  const retryPlayback = useCallback(() => {
    setFailed(false);

    if (stream !== null) {
      streamRoute.retryNow();

      return;
    }

    reloadPlayingFile();
  }, [reloadPlayingFile, setFailed, stream, streamRoute]);

  const handleFileLoaded = useCallback(async () => {
    recordPlayerControlsReady(false);
    loadEpochRef.current += 1;
    const epoch = loadEpochRef.current;
    const isCurrent = () => loadEpochRef.current === epoch;
    setFinished(false);
    setFileReady(false);
    const loaded = await readPath();

    if (!isCurrent()) return;

    if (!loaded) {
      setFileReady(true);

      return;
    }

    playbackAtoms.durationHint.set(0);
    seedTrackSelection({});

    if (streamSession.get() !== null) {
      previousFileRef.current = null;
      syncMarginsRef.current(true);
      await loadStreamSubtitles(streamSession.get(), isCurrent);

      return;
    }

    playbackAtoms.duration.set(0);
    const previousFile = previousFileRef.current;
    previousFileRef.current = loaded;
    const reload = hwdecReloadRef.current;
    const initialWatch = initialWatchRef.current;
    initialWatchRef.current = undefined;
    const entry = await measurePlayerStartup(
      "watch-state",
      () => hydrateMediaEntry(loaded, initialWatch),
      isCurrent
    );

    if (!isCurrent()) return;
    const hintedDuration = watchDuration(entry);
    playbackAtoms.durationHint.set(hintedDuration);
    const state = fileStatePatch(entry, playbackAtoms.speed.get() || 1);
    seedTrackSelection({
      audioTrack: entry?.audioTrack,
      audioTrackKey: entry?.audioTrackKey,
      subtitleTrack: entry?.subtitleTrack,
      subtitleTrackKey: entry?.subtitleTrackKey,
    });

    await setPaused(true);
    const [, audioFailure] = await attempt(
      setMpvProperty("audio-device", playerAtoms.settings.get().audioDevice)
    );

    if (audioFailure) reportBackgroundError("player.audio-device", audioFailure);

    if (!isCurrent()) return;
    const [, timingFailure] = await attempt(
      measurePlayerStartup(
        "file-state",
        () => applyFileState({ ...state, audioTrack: undefined, subtitleTrack: undefined }, loaded),
        isCurrent
      )
    );

    if (timingFailure) reportBackgroundError("player.file-state", timingFailure);

    if (!isCurrent()) return;

    const resume = resumeRef.current;
    resumeRef.current = undefined;
    const position = resolveLoadPosition(reload, resume, entry?.position);
    const liveDuration = await resolveLiveDuration(hintedDuration, position);

    if (!isCurrent()) return;
    await seekToSavedPosition(position, reload, resume, liveDuration);

    if (!isCurrent()) return;

    await measurePlayerStartup("sidecars", () => loadSidecarTracks(loaded, isCurrent), isCurrent);

    if (!isCurrent()) return;
    await measurePlayerStartup("tracks", () => applyRestoredTracks(state, loaded), isCurrent);

    if (!isCurrent()) return;
    hwdecReloadRef.current = null;

    await setPaused(true);
    await restoreLoadedPause(
      reload,
      previousFile,
      loaded,
      playerAtoms.settings.get().pauseNextEpisode
    );

    if (!isCurrent()) return;
    syncMarginsRef.current(true);
    setFileReady(true);
    recordPlayerControlsReady(true);
  }, [
    hwdecReloadRef,
    initialWatchRef,
    loadEpochRef,
    resumeRef,
    setFileReady,
    setFinished,
    syncMarginsRef,
  ]);

  return { handleFileLoaded, reloadPlayingFile, retryPlayback };
}
