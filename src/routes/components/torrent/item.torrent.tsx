import { memo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { areTorrentItemsEqual } from "@/lib/torrent/item.utils";
import type { TorrentItemProps as Props } from "@/types/torrent";

import { TorrentPeersModal } from "./peers.torrent";
import { TorrentError } from "./sections/error.sections";
import { TorrentFiles } from "./sections/files.sections";
import { TorrentHeader } from "./sections/header.sections";
import { TorrentProgress } from "./sections/progress.sections";

function TorrentItem({
  item,
  files,
  filesError,
  isExpanded,
  busy,
  queue,
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
  const [showPeers, setShowPeers] = useState(false);
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
        queue={queue}
        onPause={onPause}
        onResume={onResume}
        onSeedChange={onSeedChange}
        onSetSequential={onSetSequential}
        onRecheck={onRecheck}
        onPeers={() => setShowPeers(true)}
        onDelete={() => setPendingDelete(true)}
      />
      <TorrentProgress item={item} />
      <TorrentFiles
        item={item}
        files={files ?? []}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        onResume={onResume}
        onUpdateFiles={onUpdateFiles}
        onFilePriorityChange={onFilePriorityChange}
        onRedownload={onRedownload}
      />
      {filesError && (files ?? []).length === 0 && (
        <span className="text-destructive windows95-text px-0.5 py-0.5">
          {t("torrent.files.error")}: {filesError}
        </span>
      )}
      {item.error && <TorrentError error={item.error} onRetry={onRetry} />}
      {showPeers && (
        <TorrentPeersModal
          id={item.id}
          infoHash={item.info_hash}
          open
          onClose={() => setShowPeers(false)}
        />
      )}
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

export default memo(TorrentItem, areTorrentItemsEqual);
