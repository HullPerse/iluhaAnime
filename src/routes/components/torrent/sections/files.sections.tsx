import { ChevronDown, ChevronRight, ListOrdered, RefreshCw } from "lucide-react";
import { useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { ignore } from "@/lib/utils/promise.utils";
import type { FilePriority, TorrentFileInfo, TorrentInfo } from "@/types/torrent";

function fileIdentity(file: Pick<TorrentFileInfo, "name" | "size">): string {
  return `${file.name}|${file.size}`;
}

function NewFilesCheck({
  item,
  files,
  onUpdateFiles,
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[];
  onUpdateFiles: (indices: number[]) => void;
}) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [fresh, setFresh] = useState<TorrentFileInfo[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const check = async () => {
    if (checking) return;
    setChecking(true);
    const [data, error] = await attempt(torrentApi.runningTorrentFiles(item.id));
    setChecking(false);
    if (error || !data) return;
    const known = new Set(files.map(fileIdentity));
    const added = data.filter((file) => !known.has(fileIdentity(file)));
    if (added.length === 0) return;
    setFresh(added);
    setPicked(new Set(added.map((file) => file.index)));
  };

  const togglePicked = (index: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const confirm = () => {
    if (!fresh) return;
    const keep = new Set(files.filter((file) => file.selected).map((file) => file.index));
    for (const index of picked) keep.add(index);
    setFresh(null);
    onUpdateFiles([...keep]);
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
      {fresh && (
        <Modal
          header={t("torrent.files.new.title")}
          onClose={() => setFresh(null)}
          className="w-xl"
        >
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-1">
            <span className="windows95-text text-xs font-bold">
              {t("torrent.files.new.found", { count: fresh.length })}
            </span>
            {fresh.map((file) => (
              <label
                key={file.index}
                className="windows95-text hover:bg-surface flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 select-none"
              >
                <Checkbox
                  checked={picked.has(file.index)}
                  onChange={() => togglePicked(file.index)}
                />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="text-hint shrink-0 text-xs">{formatBytes(file.size)}</span>
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
            <Button variant="outline" onClick={() => setFresh(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirm} disabled={picked.size === 0}>
              {t("torrent.files.new.download")}
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
        <NewFilesCheck item={item} files={files} onUpdateFiles={onUpdateFiles} />
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
