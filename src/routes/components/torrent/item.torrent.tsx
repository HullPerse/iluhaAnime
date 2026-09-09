import { memo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TorrentItemProps as Props } from "@/types/torrent";

import { TorrentError } from "./sections/error.sections";
import { TorrentFiles } from "./sections/files.sections";
import { TorrentHeader } from "./sections/header.sections";
import { TorrentProgress } from "./sections/progress.sections";

function TorrentItem({
  item,
  files,
  isExpanded,
  busy,
  onToggleExpand,
  onPause,
  onResume,
  onSeedChange,
  onRemove,
  onUpdateFiles,
  onFilePriorityChange,
  onSetSequential,
  onRetry,
  onRedownload,
  onRecheck,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const isPaused = item.state === "paused";
  const isLive = item.state === "live";
  const { t } = useI18n();
  return (
    <div className="windows95-active-border bg-primary hover:bg-surface flex flex-col gap-2 p-2">
      <TorrentHeader
        item={item}
        isLive={isLive}
        isPaused={isPaused}
        busy={busy}
        onPause={onPause}
        onResume={onResume}
        onSeedChange={onSeedChange}
        onSetSequential={onSetSequential}
        onRecheck={onRecheck}
        onDelete={() => setPendingDelete(true)}
      />
      <TorrentProgress item={item} />
      {files && (
        <TorrentFiles
          item={item}
          files={files}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          onResume={onResume}
          onUpdateFiles={onUpdateFiles}
          onFilePriorityChange={onFilePriorityChange}
          onRedownload={onRedownload}
        />
      )}
      {item.error && <TorrentError error={item.error} onRetry={onRetry} />}
      {pendingDelete && (
        <ConfirmDialog
          open
          title={t("torrent.delete.title")}
          message={t("torrent.delete.message")}
          confirmLabel={t("torrent.delete.with.files")}
          cancelLabel={t("torrent.keep.files")}
          variant="destructive"
          onConfirm={() => {
            onRemove(true);
            setPendingDelete(false);
          }}
          onCancel={() => {
            onRemove(false);
            setPendingDelete(false);
          }}
          onClose={() => setPendingDelete(false)}
        />
      )}
    </div>
  );
}
export function areTorrentItemsEqual(prev: Props, next: Props): boolean {
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
    prev.item.finished === next.item.finished &&
    prev.item.eta_secs === next.item.eta_secs &&
    prev.item.error === next.item.error &&
    prev.item.peers_connected === next.item.peers_connected &&
    prev.item.sequential_download === next.item.sequential_download &&
    prev.item.name === next.item.name &&
    prev.item.save_dir === next.item.save_dir &&
    prev.item.info_hash === next.item.info_hash &&
    prev.isExpanded === next.isExpanded &&
    prev.busy === next.busy &&
    prev.files === next.files
  );
}

export default memo(TorrentItem, areTorrentItemsEqual);
