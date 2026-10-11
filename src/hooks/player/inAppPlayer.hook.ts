import { useCallback } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { buildTorrentPlayerPlaylist, loadWatch, openPlayer } from "@/lib/player/playback.utils";
import { useCell } from "@/lib/state/signal.hook";
import { withFallback } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
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
      if (!files || !saveDir) return;
      const trackExts = new Set([...audioExtensions, ...subtitleExtensions]);
      const playlist = buildTorrentPlayerPlaylist(
        files,
        saveDir,
        clickedFullPath,
        trackExts,
        extraFullPaths
      );
      if (!playlist) return;
      ignore(
        (async () => {
          const stored = await withFallback(loadWatch(clickedFullPath), null);
          const resume = stored && stored.position > 0 ? stored.position : undefined;
          const watch: PlaylistWatch | undefined =
            torrentId === undefined
              ? undefined
              : { kind: "torrent", torrentId, saveDir, anchor: clickedFullPath };
          await openPlayer(playlist.files, resume, playlist.startIndex, watch).catch(
            (error: unknown) => {
              showError(t("player.folder.open.failed.player"), String(error));
            }
          );
        })()
      );
    },
    [files, saveDir, extraFullPaths, torrentId, audioExtensions, subtitleExtensions, t]
  );
}
