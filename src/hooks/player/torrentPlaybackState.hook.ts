import { useEffect, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { createInterval } from "@/lib/pacer/interval.utils";
import { isVideoFileName } from "@/lib/player/stream.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentFileInfo } from "@/types/torrent";
import type { PlayerSource } from "@/types/videoPlayer";

const STATE_POLL_MS = 3000;

export interface TorrentPlaybackState {
  files: TorrentFileInfo[];
  /** Video files that the engine will not download, so playback cannot reach them. */
  locked: TorrentFileInfo[];
  paused: boolean;
  errored: boolean;
  /** The file behind the current playlist entry, when it belongs to this torrent. */
  current: TorrentFileInfo | undefined;
  currentLocked: boolean;
}

/**
 * Player-window view of the torrent behind the playlist. It is a UI poll only:
 * playback itself is driven by the prepared stream URLs, not by this hook.
 */
export function useTorrentPlaybackState(
  torrentId: number | undefined,
  sources: readonly PlayerSource[],
  currentTarget: string
): TorrentPlaybackState | null {
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const [state, setState] = useState<TorrentPlaybackState | null>(null);

  useEffect(() => {
    if (torrentId === undefined) {
      setState(null);
      return;
    }
    let disposed = false;

    const poll = async (): Promise<void> => {
      const [[files, filesError], [torrents, torrentsError]] = await Promise.all([
        attempt(torrentApi.runningTorrentFiles(torrentId)),
        attempt(torrentApi.listTorrents()),
      ]);
      if (disposed) return;
      if (filesError || !files) {
        setState(null);
        return;
      }
      const torrent = torrentsError ? undefined : torrents?.find((item) => item.id === torrentId);
      const locked = files.filter(
        (file) =>
          isVideoFileName(file.name, videoExtensions) &&
          !file.completed &&
          !file.selected
      );
      const source = sources.find((entry) => entry.target === currentTarget);
      const current =
        source?.fileIndex === undefined
          ? undefined
          : files.find((file) => file.index === source.fileIndex);
      setState({
        files,
        locked,
        paused: torrent?.state === "paused",
        errored: Boolean(torrent?.error),
        current,
        currentLocked: locked.some((file) => file.index === current?.index),
      });
    };

    ignore(poll());
    const { cancel } = createInterval(() => {
      ignore(poll());
    }, STATE_POLL_MS);
    return () => {
      disposed = true;
      cancel();
    };
  }, [torrentId, sources, currentTarget, videoExtensions]);

  return state;
}
