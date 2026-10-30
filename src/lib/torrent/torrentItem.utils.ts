import {
  sameDownloadOrder,
  sameExternalChangedFiles,
  sameTorrentFields,
} from "@/lib/torrent/torrentCommon.utils";
import type { TorrentInfo, TorrentItemProps } from "@/types/torrent/torrent";

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
