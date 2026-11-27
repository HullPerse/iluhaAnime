import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

import { EOF_MODE_MPV_PROPS } from "@/config/player/eofMode.config";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { computeVideoMargins, marginOptions } from "@/lib/core/player/margins.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { scheduleTask } from "@hullperse/hp_utils/shared";
import { translate } from "@/lib/locale/i18n.utils";
import { measurePlayerStartup } from "@/lib/player/startup.utils";
import {
  applyBatchProperties,
  applyPlayerProfile,
  audioOptions,
  buildInitialOptions,
  colorOptions,
  destroyPlayer,
  hdrOptions,
  initPlayer,
  loadQueue,
  takePendingOpen,
} from "@/lib/player/playback.utils";
import { getPlayerSnapshot, streamSession } from "@/store/player.store";
import { addNotification } from "@/store/notification.store";
import type { ScheduledTask } from "@/types/core/shared";
import type { PlaylistWatch, WatchState } from "@/types/player/videoPlayer";

let sessionStart: Promise<number> | null = null;
let destroyTask: ScheduledTask | null = null;

function startPlayerSession(initialOptions: Record<string, unknown>): Promise<number> {
  if (sessionStart !== null) return sessionStart;

  const started = (async () => {
    const instanceId = await measurePlayerStartup("native-init", () => initPlayer(initialOptions));
    const store = getPlayerSnapshot();
    const batchProps: Record<string, unknown> = {
      hwdec: store.hwdec,
      volume: Math.round(store.volume * 100),
      ...hdrOptions(store.settings),
      ...colorOptions(store.settings),
      ...audioOptions(store.settings),
    };
    const eofProps = EOF_MODE_MPV_PROPS[store.eofMode];
    batchProps["keep-open"] = eofProps.keepOpen;
    batchProps["loop-file"] = eofProps.loopFile;
    batchProps["loop-playlist"] = eofProps.loopPlaylist;
    await measurePlayerStartup("settings", () => applyBatchProperties(batchProps)).catch(
      (error: unknown) => reportBackgroundError("player.init.batch", error)
    );
    await measurePlayerStartup("profile", () => applyPlayerProfile(store.profile)).catch(
      (error: unknown) => reportBackgroundError("player.init.profile", error)
    );

    return instanceId;
  })();

  sessionStart = started;

  return started;
}

export function usePlayerSession({
  videoRef,
  syncMarginsRef,
  resumeRef,
  initialWatchRef,
}: {
  videoRef: RefObject<HTMLDivElement | null>;
  syncMarginsRef: RefObject<(force?: boolean) => void>;
  resumeRef: RefObject<number | undefined>;
  initialWatchRef: RefObject<WatchState | null | undefined>;
}) {
  const [attempt, setAttempt] = useState<number>(0);
  const [failed, setFailed] = useState<boolean>(false);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [liveWatch, setLiveWatch] = useState<PlaylistWatch | null>(null);

  useEffect(() => {
    if (destroyTask !== null) {
      destroyTask.cancel();
      destroyTask = null;
    }

    let disposed = false;

    if (attempt > 0) sessionStart = null;

    const start = async () => {
      const store = getPlayerSnapshot();
      const field = videoRef.current?.getBoundingClientRect();
      const seedMargins = computeVideoMargins(
        window.innerWidth || 1,
        window.innerHeight || 1,
        field ?? undefined
      );
      const instanceId = await startPlayerSession({
        ...buildInitialOptions({
          volume: store.volume,
          hwdec: store.hwdec,
          settings: store.settings,
        }),
        ...marginOptions(seedMargins),
      });

      if (disposed) return;
      syncMarginsRef.current();
      const request = await measurePlayerStartup(
        "pending-request",
        () => takePendingOpen(instanceId),
        () => !disposed
      );

      if (disposed) return;

      if (request) initialWatchRef.current = request.initialWatch;

      if (request && request.stream) {
        streamSession.set(request.stream);
        setLoadingFile(true);
      } else if (request && request.files.length > 0) {
        streamSession.set(null);
        resumeRef.current = request.resume;
        setLiveWatch(request.watch ?? null);
        setLoadingFile(true);
        await measurePlayerStartup(
          "local-load-submit",
          () => loadQueue(request.files, request.resume, request.startIndex, request.requestId),
          () => !disposed
        );
      }
    };

    start().catch((error: unknown) => {
      sessionStart = null;

      if (disposed) return;
      setFailed(true);
      addNotification(translate("player.media.error.title"), "error", String(error));
    });

    return () => {
      disposed = true;
      destroyTask = scheduleTask("timeout", 0, () => {
        destroyTask = null;
        sessionStart = null;
        ignore(destroyPlayer());
      });
    };
  }, [attempt, initialWatchRef, resumeRef, syncMarginsRef, videoRef]);

  const retrySession = useCallback(() => {
    setFailed(false);
    setLoadingFile(true);
    setAttempt((value) => value + 1);
  }, []);

  return { failed, loadingFile, liveWatch, setFailed, setLoadingFile, setLiveWatch, retrySession };
}
