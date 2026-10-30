import {
  sameDownloadOrder,
  sameExternalChangedFiles,
  sameTorrentFields,
} from "@/lib/torrent/torrentCommon.utils";
import type { TorrentInfo, TorrentItemProps } from "@/types/torrent/torrent";
import type { TorrentFileInfo } from "@/types/torrent/torrent";
import type { TFunc } from "@/types/core/i18n";
import { formatBytes } from "@/lib/core/bytes.utils";

function sameFilesState(prev: TorrentItemProps, next: TorrentItemProps): boolean {
  return prev.files === next.files && prev.filesError === next.filesError;
}

function sameTorrentInfo(prev: TorrentInfo, next: TorrentInfo): boolean {
  return (
    sameTorrentFields(prev, next) &&
    sameExternalChangedFiles(prev.external_changed_files, next.external_changed_files) &&
    sameDownloadOrder(prev.download_order, next.download_order)
  );
}

function sameQueueState(prev: TorrentItemProps, next: TorrentItemProps): boolean {
  return (
    prev.queue?.index === next.queue?.index &&
    prev.queue?.total === next.queue?.total &&
    (prev.queue === null) === (next.queue === null)
  );
}

export function areTorrentItemsEqual(prev: TorrentItemProps, next: TorrentItemProps): boolean {
  return (
    sameTorrentInfo(prev.item, next.item) &&
    sameFilesState(prev, next) &&
    sameQueueState(prev, next) &&
    prev.isExpanded === next.isExpanded &&
    prev.selected === next.selected &&
    prev.busy === next.busy
  );
}

export function partialDeleteNote(
  files: TorrentFileInfo[] | undefined,
  t: TFunc
): string | undefined {
  const unfinished = (files ?? []).filter(
    (file) => file.selected && file.size > 0 && !file.completed
  );
  if (unfinished.length === 0) return undefined;
  const bytes = unfinished.reduce(
    (sum, file) => sum + (file.on_disk_bytes || file.progress_bytes),
    0
  );
  return t("torrent.delete.unfinished", { size: formatBytes(bytes) });
}
