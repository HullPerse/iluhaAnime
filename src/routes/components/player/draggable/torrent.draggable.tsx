import { useDraggable } from "@dnd-kit/core";
import { EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";

import TorrentFilesPlayerSection from "../torrent.player";

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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
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
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        className="bg-secondary flex cursor-grab items-center gap-1 px-1 text-white select-none active:cursor-grabbing"
      >
        <span className="windows95-text line-clamp-1 flex-1 py-0.5 font-bold">{item.name}</span>
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
