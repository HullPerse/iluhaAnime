import { useQuery } from "@tanstack/react-query";

import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";

import TorrentFilesSection from "../../torrent/file.torrent";

export function TorrentCategoryEntry({
  tor,
  torrentFilesMap,
}: {
  tor: TorrentInfo;
  torrentFilesMap: Record<number, TorrentFileInfo[] | undefined>;
}) {
  const { data = [], refetch } = useQuery({
    queryKey: ["extra_files", tor.save_dir],
    queryFn: () =>
      invokeTyped<{ path: string; name: string; size: number }[]>("scan_extra_files", {
        path: tor.save_dir!,
      }).then((result) => result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path }))),
    enabled: !!tor.save_dir,
  });

  const files = (torrentFilesMap[tor.id] || []).filter((f) => f.completed);
  if (files.length === 0) return null;

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
    />
  );
}
