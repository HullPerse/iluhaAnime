import { ChevronDown, ChevronRight } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { collectFileIndices } from "@/lib/torrent/tree.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import type { TorrentFileInfo, TorrentTreeNode } from "@/types/torrent";

export function FolderRow({
  node,
  depth,
  virtualStart,
  files,
  isOpen,
  type,
  onToggleFolder,
  onToggleSelection,
}: {
  node: TorrentTreeNode;
  depth: number;
  virtualStart: number;
  files: TorrentFileInfo[];
  isOpen: boolean;
  type: "torrent" | "player";
  onToggleFolder: () => void;
  onToggleSelection?: (indices: number[], target: boolean) => void;
}) {
  const { t } = useI18n();
  const folderIndices = collectFileIndices(node);
  const folderFiles = folderIndices
    .map((i) => files.find((f) => f.index === i))
    .filter((f): f is TorrentFileInfo => f !== undefined);
  const selectable = folderFiles.filter((f) => !f.completed);
  const allSelected = selectable.length > 0 && selectable.every((f) => f.selected);
  const someSelected = selectable.some((f) => f.selected);

  return (
    <div
      className="windows95-text hover:bg-surface absolute top-0 left-0 flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none"
      style={{
        height: 20,
        transform: `translateY(${virtualStart}px)`,
        paddingLeft: `${depth * 12 + 2}px`,
      }}
    >
      {onToggleSelection && type === "torrent" && (
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          disabled={selectable.length === 0}
          onChange={() => onToggleSelection(folderIndices, !allSelected)}
          aria-label={t("torrent.select.folder", { name: node.name })}
          className="size-3"
        />
      )}
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
    </div>
  );
}
