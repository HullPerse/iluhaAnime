import { useCallback } from "react";

import { torrentApi } from "@/api/torrent.api";
import { useI18n } from "@/hooks/i18n.hook";
import { loadWatch, openPlayer } from "@/lib/player/playback.utils";
import {
  buildTorrentPlaybackPlan,
  playableTorrentIndices,
} from "@/lib/player/stream.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, withFallback } from "@/lib/utils/attempt.utils";
import { joinMediaPath } from "@/lib/utils/media.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { samePath } from "@/lib/watcher/paths.watcher";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentFileInfo } from "@/types/torrent";
import type { PlaylistWatch } from "@/types/videoPlayer";

export function useTorrentInAppPlayer(
  files: TorrentFileInfo[] | undefined,
  saveDir: string | undefined,
  extraFullPaths: string[] = [],
  torrentId?: number
): (clickedFullPath: string) => void {
  const { t } = useI18n();
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);

  return useCallback(
    (clickedFullPath: string) => {
      if (!files || !saveDir || torrentId === undefined) return;
      const trackExts = new Set([...audioExtensions, ...subtitleExtensions]);
      const clicked = files.find((file) => samePath(joinMediaPath(saveDir, file.name), clickedFullPath));
      const indices = playableTorrentIndices(files, clicked?.index ?? -1, trackExts);
      if (indices.length === 0) return;
      ignore(
        (async () => {
          const [streams, streamError] = await attempt(
            torrentApi.openTorrentStreams(torrentId, indices)
          );
          if (streamError || !streams) {
            showError(t("player.folder.open.failed.player"), String(streamError));
            return;
          }
          const plan = buildTorrentPlaybackPlan(streams, clickedFullPath, extraFullPaths);
          if (!plan) {
            showError(t("player.folder.open.failed.player"), clickedFullPath);
            return;
          }
          const stored = await withFallback(loadWatch(clickedFullPath), null);
          const resume = stored && stored.position > 0 ? stored.position : undefined;
          const watch: PlaylistWatch = {
            kind: "torrent",
            torrentId,
            saveDir,
            anchor: clickedFullPath,
          };
          await openPlayer(
            plan.files,
            resume,
            plan.startIndex,
            watch,
            plan.sources
          ).catch((error: unknown) => {
            showError(t("player.folder.open.failed.player"), String(error));
          });
        })()
      );
    },
    [files, saveDir, extraFullPaths, torrentId, audioExtensions, subtitleExtensions, t]
  );
}
