import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { EOF_MODE_MPV_PROPS } from "@/config/player/eofMode.config";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { computeVideoMargins, marginOptions } from "@/lib/core/margins.utils";
import { ignore } from "@/lib/core/promise.utils";
import { scheduleTask } from "@/lib/core/shared.utils";
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
  const [failed, setFailed] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
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
      await initPlayer({
        ...buildInitialOptions({
          volume: store.volume,
          hwdec: store.hwdec,
          settings: store.settings,
        }),
        ...marginOptions(seedMargins),
      });
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
        ignore(destroyPlayer());
      });
    };
  }, [resumeRef, syncMarginsRef, videoRef]);

  return { failed, loadingFile, liveWatch, setFailed, setLoadingFile, setLiveWatch };
}
