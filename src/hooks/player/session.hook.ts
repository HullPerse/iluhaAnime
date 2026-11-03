import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { EOF_MODE_MPV_PROPS } from "@/config/player/eofMode.config";
import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { computeVideoMargins, marginOptions } from "@/lib/core/margins.utils";
import { ignore } from "@/lib/core/promise.utils";
import { scheduleTask } from "@hullperse/hp_utils/shared";
import { translate } from "@/lib/locale/i18n.utils";
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
import { settingsAtoms } from "@/store/settings.store";
import type { ScheduledTask } from "@/types/core/shared";
import type { PlaylistWatch } from "@/types/player/videoPlayer";

/**
 * One mpv instance belongs to the player window, not to a React mount.
 * StrictMode runs the session effect twice in development, and a window reload
 * mounts it again, while the plugin's `init` is already idempotent. Caching the
 * one-time setup keeps the second mount from applying the initial options twice
 * and taking the pending open request twice (a duplicate `loadfile`).
 */
let sessionStart: Promise<void> | null = null;

function startPlayerSession(initialOptions: Record<string, unknown>): Promise<void> {
  if (sessionStart !== null) return sessionStart;

  const started = (async () => {
    const store = getPlayerSnapshot();
    await initPlayer(initialOptions);
    const batchProps: Record<string, unknown> = {
      ...hdrOptions(store.settings),
      ...colorOptions(store.settings),
      ...audioOptions(store.settings),
    };
    const eofProps = EOF_MODE_MPV_PROPS[store.eofMode];
    batchProps["keep-open"] = eofProps.keepOpen;
    batchProps["loop-file"] = eofProps.loopFile;
    batchProps["loop-playlist"] = eofProps.loopPlaylist;
    await applyBatchProperties(batchProps).catch((error: unknown) =>
      reportBackgroundError("player.init.batch", error)
    );
    await applyPlayerProfile(store.profile).catch((error: unknown) =>
      reportBackgroundError("player.init.profile", error)
    );
  })();

  sessionStart = started;
  return started;
}

export function usePlayerSession({
  videoRef,
  syncMarginsRef,
  resumeRef,
}: {
  videoRef: RefObject<HTMLDivElement | null>;
  syncMarginsRef: RefObject<(force?: boolean) => void>;
  resumeRef: RefObject<number | undefined>;
}) {
  const destroyTaskRef = useRef<ScheduledTask | null>(null);
  const [failed, setFailed] = useState<boolean>(false);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [liveWatch, setLiveWatch] = useState<PlaylistWatch | null>(null);

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
      await startPlayerSession({
        ...buildInitialOptions({
          volume: store.volume,
          hwdec: store.hwdec,
          settings: store.settings,
        }),
        ...marginOptions(seedMargins),
      });
      if (disposed) return;
      syncMarginsRef.current();
      const request = await takePendingOpen();
      if (disposed) return;
      if (request && request.stream) {
        streamSession.set(request.stream);
        setLoadingFile(true);
      } else if (request && request.files.length > 0) {
        streamSession.set(null);
        resumeRef.current = request.resume;
        setLiveWatch(request.watch ?? null);
        setLoadingFile(true);
        await loadQueue(request.files, request.resume, request.startIndex);
      }
    };

    start().catch((error: unknown) => {
      // A failed init must not leave a resolved/rejected cache behind: the next
      // mount (or a retry) has to run the setup again.
      sessionStart = null;
      if (disposed) return;
      setFailed(true);
      addNotification(
        translate(settingsAtoms.language.get(), "player.media.error.title"),
        "error",
        String(error)
      );
    });

    return () => {
      disposed = true;
      destroyTaskRef.current = scheduleTask("timeout", 0, () => {
        destroyTaskRef.current = null;
        // The instance is torn down with the window, so the next real mount
        // has to initialize a fresh session instead of reusing this cache.
        sessionStart = null;
        ignore(destroyPlayer());
      });
    };
  }, [resumeRef, syncMarginsRef, videoRef]);

  return { failed, loadingFile, liveWatch, setFailed, setLoadingFile, setLiveWatch };
}
