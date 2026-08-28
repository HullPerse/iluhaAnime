import { useDraggable } from "@dnd-kit/core";
import { EyeOff, X } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";
import type { FolderNode } from "@/types";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";

import FolderView from "./folder.player";
import TorrentFilesPlayerSection from "./torrent.player";

export function DraggableFolder({
  tree,
  onRemove,
  onHide,
  audioExtensions,
}: {
  tree: FolderNode;
  onRemove: (path: string) => void;
  onHide?: (path: string) => void;
  audioExtensions: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `folder-${tree.path}`,
      data: { type: "folder", name: tree.name, folderPath: tree.path },
    });

  const countAll =
    tree.files.length + tree.children.reduce((s, c) => s + c.files.length, 0);
  const disabledExtensions = useMemo(
    () => new Set(audioExtensions),
    [audioExtensions]
  );
  const { t } = useI18n();

  return (
    <div
      ref={setNodeRef}
      className="windows95-active-border bg-primary flex flex-col"
      style={{
        opacity: isDragging ? 0.4 : undefined,
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        className="windows95-text hover:bg-surface flex w-full cursor-grab items-center gap-1 px-0.5 py-0.5 text-left select-none active:cursor-grabbing"
      >
        <ImageComponent
          src="/images/w2k_folder_closed.ico"
          alt=""
          className="size-4 shrink-0"
        />
        <span className="flex-1 truncate select-none" title={tree.name}>
          {tree.name}
        </span>
        <span className="text-hint text-xs whitespace-nowrap select-none">
          {t("player.folder.fileCount", { count: countAll })}
        </span>
        {onHide && (
          <Button
            size="icon"
            className="h-5 w-5"
            title={t("player.visibility.hide")}
            onClick={(e) => {
              e.stopPropagation();
              onHide(tree.path);
            }}
          >
            <EyeOff className="size-3" />
          </Button>
        )}
        {onRemove && (
          <Button
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(tree.path);
            }}
          >
            <X />
          </Button>
        )}
      </div>
      <FolderView
        node={tree}
        depth={0}
        searchQuery=""
        onRemove={onRemove}
        onHide={onHide}
        disabledExtensions={disabledExtensions}
        hideRoot
      />
    </div>
  );
}

export function DraggableTorrent({
  item,
  files,
  isExpanded,
  torrentLoading,
  onToggleExpand,
  onHide,
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  isExpanded: boolean;
  torrentLoading: boolean;
  onToggleExpand: () => void;
  onHide?: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `torrent-${item.info_hash}`,
      data: {
        type: "torrent",
        name: item.name,
        infoHash: item.info_hash,
        torrentId: item.id,
        saveDir: item.save_dir,
        totalBytes: item.total_bytes,
      },
    });

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col"
      style={{
        opacity: isDragging ? 0.4 : undefined,
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        className="bg-secondary flex cursor-grab items-center gap-1 px-1 text-white select-none active:cursor-grabbing"
      >
        <span className="windows95-text line-clamp-1 flex-1 py-0.5 font-bold">
          {item.name}
        </span>
        {onHide && (
          <Button
            size="icon"
            className="size-5"
            title={t("player.visibility.hide")}
            onClick={(e) => {
              e.stopPropagation();
              onHide();
            }}
          >
            <EyeOff className="size-3" />
          </Button>
        )}
      </div>
      <TorrentFilesPlayerSection
        item={item}
        files={files}
        isExpanded={isExpanded}
        torrentLoading={torrentLoading}
        onToggleExpand={onToggleExpand}
        hideHeader
      />
    </div>
  );
}

export function DragOverlayItem({ name }: { name: string }) {
  return (
    <div className="windows95-active-border bg-primary windows95-text flex items-center gap-1 px-2 py-1 text-xs opacity-80 shadow-md">
      {name}
    </div>
  );
}
