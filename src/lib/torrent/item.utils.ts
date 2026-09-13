import type { TorrentItemProps } from "@/types/torrent";

function sameFilesState(prev: TorrentItemProps, next: TorrentItemProps): boolean {
  return prev.files === next.files && prev.filesError === next.filesError;
}

export function areTorrentItemsEqual(prev: TorrentItemProps, next: TorrentItemProps): boolean {
  return (
    prev.item.id === next.item.id &&
    prev.item.progress === next.item.progress &&
    prev.item.state === next.item.state &&
    prev.item.download_speed === next.item.download_speed &&
    prev.item.upload_speed === next.item.upload_speed &&
    prev.item.uploaded_bytes === next.item.uploaded_bytes &&
    prev.item.share_ratio === next.item.share_ratio &&
    prev.item.total_bytes === next.item.total_bytes &&
    prev.item.progress_bytes === next.item.progress_bytes &&
    sameFilesState(prev, next) &&
    prev.item.error === next.item.error &&
    prev.item.peers_connected === next.item.peers_connected &&
    prev.item.sequential_download === next.item.sequential_download &&
    prev.item.name === next.item.name &&
    prev.item.save_dir === next.item.save_dir &&
    prev.item.info_hash === next.item.info_hash &&
    prev.isExpanded === next.isExpanded &&
    prev.busy === next.busy
  );
}
