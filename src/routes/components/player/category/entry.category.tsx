import { useAppQuery } from "@/hooks/appQuery.hook";
import { useTorrentInAppPlayer } from "@/hooks/player/inAppPlayer.hook";
import { queryKeys } from "@/lib/core/keys.utils";
import { invokeTyped } from "@/lib/core/invoke.utils";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent/torrent";

import TorrentFilesSection from "@/routes/components/torrent/file.torrent";
import { TorrentPendingState } from "@/routes/components/torrent/sections/pending.sections";

export function TorrentCategoryEntry({
  tor,
  torrentFilesMap,
}: {
  tor: TorrentInfo;
  torrentFilesMap: Record<number, TorrentFileInfo[] | undefined>;
}) {
  const { data = [], refetch } = useAppQuery("slow", {
    queryKey: queryKeys.extraFiles(tor.save_dir),
    queryFn: () =>
      invokeTyped<{ path: string; name: string; size: number }[]>("scan_extra_files", {
        path: tor.save_dir!,
      }).then((result) => result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path }))),
    enabled: !!tor.save_dir,
  });

  const files = (torrentFilesMap[tor.id] || []).filter((f) => f.completed);
  const openInAppPlayer = useTorrentInAppPlayer(
    files,
    tor.save_dir,
    data.map((entry) => entry.fullPath),
    tor.id
  );
  if (torrentFilesMap[tor.id] === undefined && data.length === 0) return null;
  if (files.length === 0 && data.length === 0) return <TorrentPendingState item={tor} />;

  const handleUpscaleDone = () => refetch();
  const handleDeleteExtraFile = () => refetch();

  return (
    <TorrentFilesSection
      id={tor.id}
      files={files}
      type="player"
      path={tor.save_dir}
      extraFiles={data}
      onUpscaleDone={handleUpscaleDone}
      onDeleteExtraFile={handleDeleteExtraFile}
      onOpenInApp={openInAppPlayer}
    />
  );
}
