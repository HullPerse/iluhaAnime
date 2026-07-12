import { Button } from "@/components/ui/button.component";
import { fmtSize } from "@/lib/torrent.utils";
import { openFileInPlayer } from "@/lib/media.utils";
import type { FolderNode } from "@/types/index";
import { useSettingsStore } from "@/store/settings.store";
import { useDrag } from "react-dnd";
import {
  ChevronDown,
  ChevronRight,
  FileVideo,
  FolderOpen,
  GripVertical,
  Image,
  Monitor,
  X,
} from "lucide-react";
import { useState, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import UpscalePlayer from "./upscale.player";

type Item =
  | { kind: "folder"; node: FolderNode; depth: number }
  | { kind: "file"; file: FolderNode["files"][number]; depth: number };

function nodeMatchesSearch(node: FolderNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  for (const f of node.files) {
    if (f.name.toLowerCase().includes(q)) return true;
  }
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

function flattenTree(
  node: FolderNode,
  open: Set<string>,
  searchQuery: string,
  disabledExtensions: Set<string> | undefined,
  depth: number,
  trackExts?: Set<string>,
): Item[] {
  if (!node.children.length && !node.files.length) return [];

  let filteredFiles = searchQuery
    ? node.files.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    : node.files;

  if (trackExts) {
    filteredFiles = filteredFiles.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext ? !trackExts.has(ext) : true;
    });
  }

  const hasFilteredChildren = searchQuery
    ? node.children.some((c) => nodeMatchesSearch(c, searchQuery))
    : node.children.length > 0;

  if (searchQuery && filteredFiles.length === 0 && !hasFilteredChildren)
    return [];

  const items: Item[] = [];
  const isOpen = open.has(node.path);

  if (depth > 0) {
    items.push({ kind: "folder", node, depth });
  }

  if (isOpen || depth === 0) {
    for (const file of filteredFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const disabled = disabledExtensions && ext && disabledExtensions.has(ext);
      if (!disabled) {
        items.push({ kind: "file", file, depth: depth + 1 });
      }
    }
    for (const child of node.children) {
      items.push(
        ...flattenTree(child, open, searchQuery, disabledExtensions, depth + 1, trackExts),
      );
    }
  }

  if (depth > 0 && items.length === 1 && items[0].kind === "folder" && items[0].node.path === node.path) {
    if (isOpen) return [];
    const hasContent = filteredFiles.length > 0 || node.children.some((c) =>
      flattenTree(c, open, searchQuery, disabledExtensions, depth + 1, trackExts).length > 0,
    );
    if (!hasContent) return [];
  }

  return items;
}

function FolderView({
  node,
  depth,
  searchQuery,
  onRemove,
  onGenerate,
  isGenerating,
  disabledExtensions,
  draggable,
}: {
  node: FolderNode;
  depth: number;
  searchQuery: string;
  onRemove?: (path: string) => void;
  onGenerate?: (path: string, name: string) => void;
  isGenerating?: boolean;
  disabledExtensions?: Set<string>;
  draggable?: boolean;
}) {
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);

  const trackExts = useMemo(
    () =>
      showTrackFiles === "hide" || showTrackFiles === "torrent"
        ? new Set([...audioExtensions, ...subtitleExtensions])
        : undefined,
    [showTrackFiles, audioExtensions, subtitleExtensions],
  );

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(node.children.length > 0 ? [node.path] : []),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const flatItems = useMemo(
    () => flattenTree(node, open, searchQuery, disabledExtensions, depth, trackExts),
    [node, open, searchQuery, disabledExtensions, depth, trackExts],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });

  const isDisabled = (name: string) => {
    if (!disabledExtensions || disabledExtensions.size === 0) return false;
    const ext = name.split(".").pop()?.toLowerCase();
    return ext ? disabledExtensions.has(ext) : false;
  };

  const countAll =
    node.files.length + node.children.reduce((s, c) => s + c.files.length, 0);

  const [{ isDragging }, dragRef] = useDrag(() => ({
    type: "FOLDER",
    item: { type: "FOLDER", path: node.path },
    canDrag: draggable && depth === 0,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [node.path, draggable, depth]);

  if (flatItems.length === 0) return null;

  return (
    <main className="flex flex-col w-full">
      <div
        ref={draggable && depth === 0 ? (node) => { if (node) dragRef(node); } : undefined}
        role="button"
        className={`flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left ${isDragging ? "opacity-50" : ""}`}
        onClick={() => toggle(node.path)}
        style={{
          paddingLeft: `${depth * 12 + 2}px`,
        }}
      >
        {depth === 0 && draggable && (
          <GripVertical className="size-3 shrink-0 text-muted cursor-grab" />
        )}
        {open.has(node.path) ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <FolderOpen className="size-3 shrink-0 text-muted" />
        <span className="truncate select-none flex-1" title={node.name}>
          {node.name}
        </span>
        {depth === 0 && (
          <>
            <span className="text-muted whitespace-nowrap select-none text-[10px]">
              {countAll} файлов
            </span>
            {onGenerate && (
              <Button
                size="icon"
                className="h-5 w-5"
                title="Сгенерировать превью"
                disabled={isGenerating}
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate(node.path, node.name);
                }}
              >
                <Image className="size-3" />
              </Button>
            )}
            {onRemove && (
              <Button
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(node.path);
                }}
              >
                <X />
              </Button>
            )}
          </>
        )}
      </div>

      {open.has(node.path) && (
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: flatItems.length > 50 ? 300 : undefined }}
        >
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((vItem, index) => {
              const item = flatItems[vItem.index];
              if (!item) return null;

              if (item.kind === "folder") {
                const isFolderOpen = open.has(item.node.path);
                return (
                  <div
                    key={index}
                    role="button"
                    className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left absolute top-0 left-0"
                    style={{
                      height: 20,
                      transform: `translateY(${vItem.start}px)`,
                      paddingLeft: `${item.depth * 12 + 2}px`,
                    }}
                    onClick={() => toggle(item.node.path)}
                  >
                    {isFolderOpen ? (
                      <ChevronDown className="size-3 shrink-0" />
                    ) : (
                      <ChevronRight className="size-3 shrink-0" />
                    )}
                    <FolderOpen className="size-3 shrink-0 text-muted" />
                    <span
                      className="truncate select-none"
                      title={item.node.name}
                    >
                      {item.node.name}
                    </span>
                  </div>
                );
              }

              const file = item.file;
              const disabled = isDisabled(file.name);
              return (
                <div
                  key={index}
                  className="flex items-center gap-1 px-1 windows95-border h-5 bg-white absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${vItem.start}px)`,
                    paddingLeft: `${item.depth * 12 + 2}px`,
                  }}
                >
                  <FileVideo className="size-4 text-muted" />
                  <span
                    title={file.name}
                    className="windows95-text truncate flex-1"
                  >
                    {file.name}
                  </span>

                  <span className="windows95-text text-muted">
                    {fmtSize(file.size)}
                  </span>

                  {!disabled && file.path && <UpscalePlayer filePath={file.path} />}
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled}
                    onClick={async () => {
                      if (!file.path) return;
                      openFileInPlayer(file.path);
                    }}
                    title={
                      disabled
                        ? "Аудио/субтитры нельзя открыть"
                        : "Открыть в медиа плеере"
                    }
                  >
                    <Monitor className="size-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

export default FolderView;
