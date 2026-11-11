import { useCallback } from "react";
import type { RefObject } from "react";

import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import type { StreamRouteGuard } from "@/hooks/player/streamRoute.hook";
import {
  applyFileState,
  playPlaylistIndex,
  readDuration,
  readPath,
  seekTo,
  setPaused,
} from "@/lib/player/playback.utils";
import { fileStatePatch, restoreReloadPaused } from "@/lib/player/playerChrome.utils";
import {
  RESUME_END_MARGIN,
  RESUME_MIN,
  needsExactSeek,
  resolveLoadPosition,
  shouldSkipFrontendSeek,
} from "@/lib/player/resume.utils";
import { loadSidecarTracks } from "@/lib/player/sidecar.utils";
import { hydrateMediaEntry } from "@/store/media.store";
import { playbackAtoms, streamSession } from "@/store/player.store";
import type { HwdecReload } from "@/types/player/resume";
import type { StreamOpen } from "@/types/player/videoPlayer";

interface PlayerFileLoadDeps {
  stream: StreamOpen | null;
  streamRoute: StreamRouteGuard;
  syncMarginsRef: RefObject<(force?: boolean) => void>;
  resumeRef: RefObject<number | undefined>;
  hwdecReloadRef: RefObject<HwdecReload | null>;
  loadEpochRef: RefObject<number>;
  setFinished: (value: boolean) => void;
  setLoadingFile: (value: boolean) => void;
  setFailed: (value: boolean) => void;
}

export function usePlayerFileLoad({
  stream,
  streamRoute,
  syncMarginsRef,
  resumeRef,
  hwdecReloadRef,
  loadEpochRef,
  setFinished,
  setLoadingFile,
  setFailed,
}: PlayerFileLoadDeps) {
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
    await loadSidecarTracks(loaded);
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
  }, [hwdecReloadRef, loadEpochRef, resumeRef, setFinished, syncMarginsRef]);

  return { handleFileLoaded, reloadPlayingFile, retryPlayback };
}
