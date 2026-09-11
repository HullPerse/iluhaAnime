import { useDraggable } from "@dnd-kit/core";
import { EyeOff, X } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import {
  FOLDER_MAX_VIEWPORT_MARGIN,
  FOLDER_MIN_HEIGHT,
  FOLDER_RESIZE_STEP,
} from "@/config/player/folders.config";
import { useBottomResize } from "@/hooks/folderResize.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { summarizeTree } from "@/lib/player/tree.utils";
import { normalizePlayerPath } from "@/lib/player/visibility.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { FolderNode } from "@/types/torrent";

import FolderView from "../folder.player";

function maxFolderHeight(): number {
  return Math.max(FOLDER_MIN_HEIGHT, window.innerHeight - FOLDER_MAX_VIEWPORT_MARGIN);
}

export function DraggableFolder({
  tree,
  onRemove,
  onHide,
}: {
  tree: FolderNode;
  onRemove: (path: string) => void;
  onHide?: (path: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `folder-${tree.path}`,
    data: { type: "folder", name: tree.name, folderPath: tree.path },
  });

  const summary = useMemo(() => summarizeTree(tree), [tree]);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const disabledExtensions = useMemo(() => new Set(audioExtensions), [audioExtensions]);
  const { t } = useI18n();

  const savedHeight = useSettingsStore(
    (s) => s.playerFolderHeights[normalizePlayerPath(tree.path)]
  );
  const setPlayerFolderHeight = useSettingsStore((s) => s.setPlayerFolderHeight);
  const saveHeight = useCallback(
    (path: string) => (height: number) => setPlayerFolderHeight(path, height),
    [setPlayerFolderHeight]
  );
  const onResizeEnd = useMemo(() => saveHeight(tree.path), [saveHeight, tree.path]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const getRenderedListHeight = useCallback(() => scrollRef.current?.clientHeight, []);

  const viewportMax = maxFolderHeight();
  const appliedSavedHeight =
    savedHeight !== undefined ? Math.min(savedHeight, viewportMax) : undefined;

  const { dragging, previewHeight, beginDrag, adjust } = useBottomResize({
    height: appliedSavedHeight,
    minHeight: FOLDER_MIN_HEIGHT,
    maxHeight: viewportMax,
    getStartHeight: getRenderedListHeight,
    onResizeEnd,
  });

  const preview = dragging && previewHeight !== null ? previewHeight : undefined;
  const listMaxHeight = preview ?? appliedSavedHeight;
  const listMinHeight = preview ?? appliedSavedHeight;

  return (
    <div
      ref={setNodeRef}
      className={`windows95-active-border bg-primary flex flex-col${
        dragging ? " pointer-events-none" : ""
      }`}
      style={{
        opacity: isDragging ? 0.4 : undefined,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        className="windows95-text hover:bg-surface flex w-full cursor-grab items-center gap-1 px-0.5 py-0.5 text-left select-none active:cursor-grabbing"
      >
        <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4 shrink-0" />
        <span className="flex-1 truncate select-none" title={tree.name}>
          {tree.name}
        </span>
        <span className="text-hint text-xs whitespace-nowrap select-none">
          {t("player.folder.file.count", { count: summary.count })}, {formatBytes(summary.bytes)}
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
        contentSized
        listMaxHeight={listMaxHeight}
        listMinHeight={listMinHeight}
        scrollRef={scrollRef}
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("player.folder.resize")}
        aria-valuenow={listMaxHeight ? Math.round(listMaxHeight) : undefined}
        tabIndex={0}
        className="bg-surface hover:bg-highlight focus-visible:outline-text pointer-events-auto h-1.5 shrink-0 cursor-s-resize touch-none select-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        onMouseDown={beginDrag}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();

            const direction = e.key === "ArrowUp" ? -1 : 1;
            adjust(direction * FOLDER_RESIZE_STEP);
          }
        }}
      />
    </div>
  );
}
