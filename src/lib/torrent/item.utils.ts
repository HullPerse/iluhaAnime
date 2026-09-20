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
    prev.peers_connected === next.peers_connected &&
    prev.sequential_download === next.sequential_download &&
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

/**
 * Handlers are deliberately not compared: every one of them only closes over stable
 * torrent fields (`id`, `info_hash`) and stable store actions, and the queue callback
 * reads the list through a ref. Comparing them instead would re-render every row on
 * every parent render, which is what this memo exists to avoid.
 */
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
