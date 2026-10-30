import { ChevronDown, ChevronRight, ListOrdered, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/keys.utils";
import { downloadOrderPositions } from "@/lib/torrentQueue.utils";
import { UPDATE_SOURCES_WITH_FILES, findUpdatedFiles } from "@/lib/torrentUpdate.utils";
import { attempt } from "@/lib/attempt.utils";
import { formatBytes } from "@/lib/bytes.utils";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { showError } from "@/lib/notification.utils";
import { ignore } from "@/lib/promise.utils";
import { settingsAtoms } from "@/store/settings.store";
import type {
  FilePriority,
  TorrentDetailFile,
  TorrentDetails,
  TorrentFileInfo,
  TorrentInfo,
  TorrentQueueApply,
} from "@/types/torrent";

function UpdateCheck({
  item,
  files,
  onUpdateRequest,
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[];
  onUpdateRequest: (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => void;
}) {
  const { t } = useI18n();
  const sourceQuery = useAppQuery("slow", {
    queryKey: queryKeys.torrentSource(item.id, item.info_hash),
    queryFn: () => torrentApi.getTorrentSource(item.id, item.info_hash),
  });
  const sourceData = sourceQuery.data;
  const origin = sourceData && UPDATE_SOURCES_WITH_FILES.has(sourceData.source) ? sourceData : null;
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<{
    added: TorrentDetailFile[];
    details: TorrentDetails;
    replaced: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (origin === null) return null;

  const check = async () => {
    if (checking) return;
    setChecking(true);
    const proxy = settingsAtoms.searchProxyUrls.get()[origin.source] || undefined;
    const [details, error] = await attempt(
      torrentApi.getTorrentDetails(origin.source, origin.url, proxy)
    );
    setChecking(false);
    if (error || !details) {
      if (error) showError(t("torrent.files.update.error"), error.message);
      return;
    }
    const added = findUpdatedFiles(files, details.files);
    const replaced =
      Boolean(details.infoHash) && details.infoHash.toLowerCase() !== item.info_hash.toLowerCase();
    if (added.length === 0 && !replaced) return;
    setUpdate({ added, details, replaced });
    setPicked(new Set(added.map((file) => file.name)));
  };

  const togglePicked = (name: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const confirm = () => {
    if (!update) return;
    const added = update.added.filter((file) => picked.has(file.name));
    setUpdate(null);
    if (added.length === 0) return;
    onUpdateRequest({ added, details: update.details });
  };

  return (
    <>
      <Button
        size="icon"
        className="ml-auto size-5"
        title={t("torrent.files.check.new")}
        aria-label={t("torrent.files.check.new")}
        loading={checking}
        onClick={(event) => {
          event.stopPropagation();
          ignore(check());
        }}
      >
        <RefreshCw className="size-3" />
      </Button>
      {update && (
        <Modal
          header={t("torrent.files.update.title")}
          onClose={() => setUpdate(null)}
          className="w-xl"
        >
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-1">
            {update.replaced && (
              <span className="windows95-text text-xs font-bold">
                {t("torrent.files.update.replaced")}
              </span>
            )}
            <span className="windows95-text text-xs font-bold">
              {t("torrent.files.new.found", { count: update.added.length })}
            </span>
            {update.added.map((file) => (
              <label
                key={file.name}
                className="windows95-text hover:bg-surface flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 select-none"
              >
                <Checkbox
                  checked={picked.has(file.name)}
                  onChange={() => togglePicked(file.name)}
                />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="text-hint shrink-0 text-xs">{file.size || "-"}</span>
              </label>
            ))}
            <span className="windows95-text text-hint mt-1 text-xs">
              {t("torrent.files.new.existing", {
                count: files.filter((file) => file.selected).length,
                total: files.length,
              })}
            </span>
          </div>
          <div className="flex justify-end gap-1 p-1">
            <Button variant="outline" onClick={() => setUpdate(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirm} disabled={picked.size === 0}>
              {t("torrent.files.update.download")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

import TorrentFilesSection from "../file.torrent";
import { TorrentQueueModal } from "../queue.torrent";
import { TorrentLimitsSection } from "./limits.sections";

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
