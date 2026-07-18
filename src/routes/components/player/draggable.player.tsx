import { useDraggable } from "@dnd-kit/core";
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
      data: { type: "folder" as const, name: tree.name, folderPath: tree.path },
    });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="flex flex-col windows95-active-border bg-primary"
      style={{
        opacity: isDragging ? 0.4 : undefined,
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
      }}
    >
      <FolderView
        node={tree}
        depth={0}
        searchQuery=""
        onRemove={onRemove}
        disabledExtensions={new Set(audioExtensions)}
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
        type: "torrent" as const,
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
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0.4 : undefined,
        transform: transform
          ? `translate(${transform.x}px, ${transform.y}px)`
          : undefined,
      }}
    >
      <TorrentFilesPlayerSection
        item={item}
        files={files}
        isExpanded={isExpanded}
        torrentLoading={torrentLoading}
        onToggleExpand={onToggleExpand}
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
