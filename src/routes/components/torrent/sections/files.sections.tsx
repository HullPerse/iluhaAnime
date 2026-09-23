import { ChevronDown, ChevronRight, ListOrdered } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { FilePriority, TorrentFileInfo, TorrentInfo } from "@/types/torrent";

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
