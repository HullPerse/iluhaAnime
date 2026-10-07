import { ChevronDown, ChevronRight, ListOrdered, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { showError } from "@/lib/utils/notification.utils";
import { UPDATE_SOURCES_WITH_FILES, findUpdatedFiles } from "@/lib/torrent/update.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  FilePriority,
  TorrentDetailFile,
  TorrentDetails,
  TorrentFileInfo,
  TorrentInfo,
  TorrentOrigin,
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
  const [origin, setOrigin] = useState<TorrentOrigin | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<{
    added: TorrentDetailFile[];
    details: TorrentDetails;
    replaced: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    ignore(
      attempt(torrentApi.getTorrentSource(item.id, item.info_hash)).then(([data]) => {
        if (cancelled) return;
        setOrigin(data && UPDATE_SOURCES_WITH_FILES.has(data.source) ? data : null);
      })
    );
    return () => {
      cancelled = true;
    };
  }, [item.id, item.info_hash]);

  if (origin === null || origin === undefined) return null;

  const check = async () => {
    if (checking) return;
    setChecking(true);
    const proxy = useSettingsStore.getState().searchProxyUrls[origin.source] || undefined;
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
      Boolean(details.infoHash) &&
      details.infoHash.toLowerCase() !== item.info_hash.toLowerCase();
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
        disabled={checking}
        onClick={(event) => {
          event.stopPropagation();
          ignore(check());
        }}
      >
        {checking ? <SmallLoader size={3} /> : <RefreshCw className="size-3" />}
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
  onSetDownloadOrder,
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
  onSetDownloadOrder: (indices: number[]) => void;
  onRedownload: (fileIndex: number) => void;
  onUpdateRequest: (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => void;
}) {
  const { t } = useI18n();
  const [showQueue, setShowQueue] = useState(false);
  const completed = files.filter((file) => file.completed).length;
  const missing = files.filter((file) => file.completed && !file.exists).length;
  const sequentialFile = files.find((file) => file.index === item.sequential_file);
  const orderable = files.filter((file) => file.selected && !file.completed).length > 1;
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
      </div>
      {isExpanded && (
        <>
          <TorrentLimitsSection id={item.id} infoHash={item.info_hash} />
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
          />
        </>
      )}
      {showQueue && (
        <TorrentQueueModal
          files={files}
          order={item.download_order}
          current={item.sequential_file}
          onSave={onSetDownloadOrder}
          onClose={() => setShowQueue(false)}
        />
      )}
    </section>
  );
}
