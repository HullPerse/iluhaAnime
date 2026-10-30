import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentInfo } from "@/types/torrent/torrent";

export function SparseWarning({ item, isExpanded }: { item: TorrentInfo; isExpanded: boolean }) {
  const { t } = useI18n();
  if (item.disk_sparse !== false || isExpanded) return null;
  return (
    <span data-testid="torrent-sparse-warning" className="windows95-text text-destructive text-xs">
      {t("torrent.files.sparse.unsupported")}
    </span>
  );
}
