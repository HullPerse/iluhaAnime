import { useDraggable } from "@dnd-kit/core";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";
import type { FolderNode } from "@/types";
import TorrentFilesPlayerSection from "./torrent.player";
import FolderView from "./folder.player";

export function DraggableFolder({
  tree,
  onRemove,
  audioExtensions,
}: {
  tree: FolderNode;
  onRemove: (path: string) => void;
  audioExtensions: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `folder-${tree.path}`,
      data: { type: "folder", name: tree.name, folderPath: tree.path },
    });

  const countAll =
    tree.files.length + tree.children.reduce((s, c) => s + c.files.length, 0);

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col windows95-active-border bg-primary"
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
        className="flex items-center gap-1 windows95-text cursor-grab active:cursor-grabbing hover:bg-surface px-0.5 py-0.5 w-full text-left select-none"
      >
        <ImageComponent
          src="/icons/w2k_folder_closed.ico"
          alt=""
          className="size-4 shrink-0"
        />
        <span className="truncate select-none flex-1" title={tree.name}>
          {tree.name}
        </span>
        <span className="text-muted whitespace-nowrap select-none text-[10px]">
          {countAll} файлов
        </span>
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
        disabledExtensions={new Set(audioExtensions)}
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
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  isExpanded: boolean;
  torrentLoading: boolean;
  onToggleExpand: () => void;
}) {
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
        className="flex items-center gap-1 bg-secondary text-white px-1 cursor-grab active:cursor-grabbing select-none"
      >
        <span className="flex-1 line-clamp-1 font-bold windows95-text py-0.5">
          {item.name}
        </span>
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
    <div className="flex items-center gap-1 px-2 py-1 windows95-active-border bg-primary shadow-md text-xs windows95-text opacity-80">
      {name}
    </div>
  );
}
