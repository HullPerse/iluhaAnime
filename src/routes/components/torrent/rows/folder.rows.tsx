import { ChevronDown, ChevronRight } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { collectFileIndices } from "@/lib/torrent/tree.utils";
import type { TorrentTreeNode } from "@/types/torrent";
import type { TorrentFileInfo, FilePriority } from "@/types/torrent";

export function FolderRow({
  node,
  depth,
  virtualStart,
  files,
  isOpen,
  type,
  onToggleFolder,
  onPriorityChange,
}: {
  node: TorrentTreeNode;
  depth: number;
  virtualStart: number;
  files: TorrentFileInfo[];
  isOpen: boolean;
  type: "torrent" | "player";
  onToggleFolder: () => void;
  onPriorityChange?: (indices: number[], priority: FilePriority) => void;
}) {
  const { t } = useI18n();
  const folderIndices = collectFileIndices(node);
  const folderFiles = folderIndices
    .map((i) => files.find((f) => f.index === i))
    .filter((f): f is TorrentFileInfo => f !== undefined);
  const folderPriority =
    folderFiles.length > 0 && folderFiles.every((f) => f.priority === folderFiles[0].priority)
      ? folderFiles[0].priority
      : "normal";

  return (
    <div
      className="windows95-text hover:bg-surface absolute top-0 left-0 flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none"
      style={{
        height: 20,
        transform: `translateY(${virtualStart}px)`,
        paddingLeft: `${depth * 12 + 2}px`,
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1" onClick={onToggleFolder}>
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4 shrink-0" />
        <span className="truncate font-bold" title={node.name}>
          {node.name}
        </span>
        <span className="text-hint whitespace-nowrap">
          {formatBytes(
            node.files.reduce((s, f) => s + f.size, 0) +
              node.children.reduce(
                (s, c) =>
                  s +
                  c.files.reduce((s2, f) => s2 + f.size, 0) +
                  c.children.reduce((s3, cc) => s3 + cc.files.reduce((s4, f) => s4 + f.size, 0), 0),
                0
              )
          )}
        </span>
      </div>
      {onPriorityChange && type === "torrent" && (
        <Select
          className="w-28"
          value={folderPriority}
          onChange={(v) => onPriorityChange(folderIndices, v as FilePriority)}
          options={[
            { value: "normal", label: t("torrent.priority.normal") },
            {
              value: "do_not_download",
              label: t("torrent.priority.skip"),
            },
          ]}
          arrow={false}
        />
      )}
    </div>
  );
}
