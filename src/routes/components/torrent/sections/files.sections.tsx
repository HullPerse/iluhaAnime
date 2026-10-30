import { ChevronDown, ChevronRight, ListOrdered } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button.component";
import UpdateCheck from "./update.sections";
import { useI18n } from "@/hooks/i18n.hook";
import { downloadOrderPositions } from "@/lib/torrent/torrentQueue.utils";
import { formatBytes } from "@/lib/core/bytes.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type {
  FilePriority,
  TorrentDetailFile,
  TorrentDetails,
  TorrentFileInfo,
  TorrentInfo,
  TorrentQueueApply,
} from "@/types/torrent/torrent";

import TorrentFilesSection from "@/routes/components/torrent/file.torrent";
import { TorrentQueueModal } from "@/routes/components/torrent/queue.torrent";
import { TorrentLimitsSection } from "@/routes/components/torrent/sections/limits.sections";

export function TorrentFiles({
  item,
  files,
  isExpanded,
  onToggleExpand,
  onResume,
  onUpdateFiles,
  onFilePriorityChange,
  onApplyQueue,
  onRedownload,
  onUpdateRequest,
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onResume: () => void;
  onUpdateFiles: (indices: number[]) => void;
  onFilePriorityChange: (indices: number[], priority: FilePriority) => void;
  onApplyQueue: (payload: TorrentQueueApply) => Promise<boolean>;
  onRedownload: (fileIndex: number) => void;
  onUpdateRequest: (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => void;
}) {
  const { t } = useI18n();
  const [showQueue, setShowQueue] = useState(false);
  const completed = files.filter((file) => file.completed).length;
  const missing = files.filter((file) => file.completed && !file.exists).length;
  const sequentialFile = files.find((file) => file.index === item.sequential_file);
  const remaining = files.filter((file) => !file.completed).length;
  const orderable = remaining > 1;
  // What the selected payloads already occupy on the volume, next to what
  // they will occupy once finished. Sparse files keep the first number near
  // the downloaded bytes while the second one is the full payload.
  const selection = files.filter((file) => file.selected);
  const selectionBytes = selection.reduce((sum, file) => sum + file.size, 0);
  const selectionOnDisk = selection.reduce((sum, file) => sum + (file.on_disk_bytes ?? 0), 0);
  const showDiskUsage = !item.finished && selectionBytes > 0;
  const queuePositions = useMemo(
    () =>
      item.sequential_download ? downloadOrderPositions(files, item.download_order) : undefined,
    [files, item.download_order, item.sequential_download]
  );
  return (
    <section>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={t("torrent.files.count", {
          done: completed,
          total: files.length,
        })}
        className="windows95-text hover:bg-surface focus-visible:outline-text flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        onClick={onToggleExpand}
        onKeyDown={enterOrSpace(onToggleExpand)}
      >
        {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {t("torrent.files.count", { done: completed, total: files.length })}
        {missing > 0 && (
          <span className="text-destructive ml-1">
            - {missing} {t("torrent.missing")}
          </span>
        )}
        {sequentialFile && (
          <span
            className="text-hint ml-1 min-w-0 truncate"
            title={t("torrent.sequential.now", { name: sequentialFile.name })}
          >
            {t("torrent.sequential.now", { name: sequentialFile.name })}
          </span>
        )}
        {queuePositions && queuePositions.size > 1 && (
          <span
            className="text-hint ml-1 shrink-0"
            title={t("torrent.queue.badge", { count: queuePositions.size })}
          >
            {t("torrent.queue.badge", { count: queuePositions.size })}
          </span>
        )}
        <section className="ml-auto flex flex-row items-center gap-1">
          {orderable && (
            <Button
              size="icon"
              className="ml-auto size-5"
              title={t("torrent.queue.button")}
              aria-label={t("torrent.queue.button")}
              onClick={(event) => {
                event.stopPropagation();
                setShowQueue(true);
              }}
            >
              <ListOrdered className="size-3" />
            </Button>
          )}
          <UpdateCheck item={item} files={files} onUpdateRequest={onUpdateRequest} />
        </section>
      </div>
      {isExpanded && (
        <>
          <TorrentLimitsSection id={item.id} infoHash={item.info_hash} />
          {showDiskUsage && (
            <p className="windows95-text text-hint px-0.5 text-xs" data-testid="torrent-disk-usage">
              {t("torrent.files.disk.usage", {
                onDisk: formatBytes(selectionOnDisk),
                total: formatBytes(selectionBytes),
              })}
            </p>
          )}
          {item.disk_sparse === false && (
            <p className="windows95-text text-destructive px-0.5 py-0.5 text-xs">
              {t("torrent.files.sparse.unsupported")}
            </p>
          )}
          <TorrentFilesSection
            id={item.id}
            files={files}
            type="torrent"
            onToggle={(_id, indices) => onUpdateFiles(indices)}
            onFilePriorityChange={(_id, indices, priority) =>
              onFilePriorityChange(indices, priority)
            }
            onResume={item.state === "paused" ? onResume : undefined}
            onRedownload={onRedownload}
            sequentialFile={item.sequential_file}
            queuePositions={queuePositions}
          />
        </>
      )}
      {showQueue && (
        <TorrentQueueModal
          files={files}
          order={item.download_order}
          current={item.sequential_file}
          sequential={item.sequential_download}
          onApply={onApplyQueue}
          onClose={() => setShowQueue(false)}
        />
      )}
    </section>
  );
}
