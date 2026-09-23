import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "cn";
import { AlertTriangle, GripVertical } from "lucide-react";
import { memo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { areTorrentItemsEqual } from "@/lib/torrent/item.utils";
import type { TorrentItemProps as Props } from "@/types/torrent";

import { TorrentPeersModal } from "./peers.torrent";
import { TorrentProblem } from "./sections/error.sections";
import { TorrentFiles } from "./sections/files.sections";
import { TorrentHeader } from "./sections/header.sections";
import { TorrentProgress } from "./sections/progress.sections";

function TorrentItem({
  item,
  files,
  filesError,
  isExpanded,
  selected,
  busy,
  queue,
  onToggleExpand,
  onSelectChange,
  onPause,
  onResume,
  onSeedChange,
  onRemove,
  onUpdateFiles,
  onFilePriorityChange,
  onSetDownloadOrder,
  onSetSequential,
  onRecreate,
  onRedownload,
  onRecheck,
  onRecheckPaused,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const [showPeers, setShowPeers] = useState(false);
  const isPaused = item.state === "paused";
  const isLive = item.state === "live";
  const { t } = useI18n();
  const changedNames = item.paused_changed_files.join(", ");
  const externalChangedTitle = [t("torrent.paused.external.hint"), changedNames]
    .filter(Boolean)
    .join("\n");
  const draggable = queue !== null;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: item.id, disabled: !draggable });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: item.id, disabled: !draggable });
  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      data-testid="torrent-item"
      className={cn(
        "windows95-active-border bg-primary hover:bg-surface flex flex-col gap-2 p-2",
        isOver && !isDragging && "windows95-border"
      )}
      style={{
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      <TorrentHeader
        item={item}
        selected={selected}
        onSelectChange={onSelectChange}
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
        dragHandle={
          queue && (
            <span
              ref={setActivatorNodeRef}
              data-testid="torrent-drag-handle"
              className="text-hint shrink-0 cursor-grab active:cursor-grabbing"
              title={t("torrent.queue.drag")}
              aria-label={t("torrent.queue.drag")}
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-4" />
            </span>
          )
        }
      />
      <TorrentProgress item={item} />
      {item.paused_external_changes && (
        <div className="flex items-center gap-1">
          <span
            role="status"
            data-testid="torrent-external-badge"
            className="text-torrent-missing windows95-font flex min-w-0 items-center gap-1 text-xs"
            title={externalChangedTitle}
          >
            <AlertTriangle className="size-3 shrink-0" />
            <span className="truncate">
              {t("torrent.paused.external")}
              {changedNames && `: ${changedNames}`}
            </span>
          </span>
          <Button className="windows95-text text-xs" disabled={busy} onClick={onRecheckPaused}>
            {t("torrent.paused.recheck")}
          </Button>
        </div>
      )}
      <TorrentFiles
        item={item}
        files={files ?? []}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        onResume={onResume}
        onUpdateFiles={onUpdateFiles}
        onFilePriorityChange={onFilePriorityChange}
        onSetDownloadOrder={onSetDownloadOrder}
        onRedownload={onRedownload}
      />
      {filesError && (files ?? []).length === 0 && (
        <span className="text-destructive windows95-text px-0.5 py-0.5">
          {t("torrent.files.error")}: {filesError}
        </span>
      )}
      {(item.error || item.missing_files) && (
        <TorrentProblem
          error={item.error}
          missing={item.missing_files}
          onRecheck={onRecheck}
          onRecreate={onRecreate}
        />
      )}
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
