import { useQueryClient } from "@tanstack/react-query";
import { TORRENTS_QUERY_KEY, useTorrents } from "@/hooks/torrent/queries.hook";
import { useTorrentRealtime } from "@/hooks/torrent/realtime.hook";
import { useCell } from "@hullperse/hp_utils/react";
import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import { cacheAtoms } from "@/store/cache.store";
import {
  cancelTorrentDownload as cancelDownload,
  confirmTorrentDownload as confirmDownload,
  torrentAtoms,
} from "@/store/download.store";

export function TorrentRuntime() {
  const queryClient = useQueryClient();
  const preparation = useCell(torrentAtoms.preparation);
  const preparationPhase = preparation.phase;
  const pendingTorrent =
    preparationPhase.phase === "pending" || preparationPhase.phase === "confirming"
      ? preparationPhase.pending
      : null;
  const preparingTorrent = preparationPhase.phase === "preparing";
  const lastSaveDir = useCell(cacheAtoms.lastSaveDir);
  const torrentsQuery = useTorrents();
  useTorrentRealtime(torrentsQuery);

  if (!preparingTorrent && !pendingTorrent) return null;

  return (
    <TorrentFilePicker
      torrent={pendingTorrent}
      loading={!!preparingTorrent && !pendingTorrent}
      defaultSaveDir={lastSaveDir}
      existingTorrents={torrentsQuery.data}
      onConfirm={async (selectedIndices, saveDir, subFolder, sequential) => {
        await confirmDownload(selectedIndices, saveDir, subFolder, sequential);
        queryClient.invalidateQueries({ queryKey: TORRENTS_QUERY_KEY });
      }}
      onCancel={cancelDownload}
    />
  );
}
