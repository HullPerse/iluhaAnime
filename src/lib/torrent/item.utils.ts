import { sameDownloadOrder, samePausedChangedFiles } from "@/lib/torrent/common.utils";
import type { TorrentInfo, TorrentItemProps } from "@/types/torrent";

function sameFilesState(prev: TorrentItemProps, next: TorrentItemProps): boolean {
  return prev.files === next.files && prev.filesError === next.filesError;
}

function sameTorrentInfo(prev: TorrentInfo, next: TorrentInfo): boolean {
  return (
    prev.id === next.id &&
    prev.progress === next.progress &&
    prev.state === next.state &&
    prev.download_speed === next.download_speed &&
    prev.upload_speed === next.upload_speed &&
    prev.uploaded_bytes === next.uploaded_bytes &&
    prev.share_ratio === next.share_ratio &&
    prev.total_bytes === next.total_bytes &&
    prev.progress_bytes === next.progress_bytes &&
    prev.error === next.error &&
    prev.missing_files === next.missing_files &&
    prev.paused_external_changes === next.paused_external_changes &&
    samePausedChangedFiles(prev.paused_changed_files, next.paused_changed_files) &&
    prev.peers_connected === next.peers_connected &&
    prev.sequential_download === next.sequential_download &&
    prev.sequential_file === next.sequential_file &&
    sameDownloadOrder(prev.download_order, next.download_order) &&
    prev.name === next.name &&
    prev.save_dir === next.save_dir &&
    prev.info_hash === next.info_hash
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
