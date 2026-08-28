import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, useCallback, useMemo } from "react";

import { buildTorrentTree } from "@/lib/torrent.utils";
import type { TorrentTreeNode, TorrentTreeFile } from "@/lib/torrent.utils";
import {
  FolderRow,
  TorrentFileRow,
} from "@/routes/components/torrent/row.torrent";
import { useSettingsStore } from "@/store/settings.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { TorrentFileInfo, FilePriority } from "@/types/torrent";

type TorrentTreeFileWithPath = TorrentTreeFile & { _fullPath: string };

type Item =
  | { kind: "folder"; node: TorrentTreeNode; depth: number }
  | { kind: "file"; file: TorrentTreeFile; depth: number };

function flattenTorrentTree(
  nodes: TorrentTreeNode[],
  open: Set<string>,
  fileFilter?: (f: TorrentTreeFile) => boolean,
  rootFiles?: TorrentTreeFile[],
  depth = 0
): Item[] {
  const items: Item[] = [];

  if (depth === 0 && rootFiles) {
    for (const file of rootFiles) {
      items.push({ kind: "file", file, depth: 0 });
    }
  }

  for (const node of nodes) {
    items.push({ kind: "folder", node, depth });
    if (open.has(node.name + depth)) {
      const files = fileFilter ? node.files.filter(fileFilter) : node.files;
      for (const file of files) {
        items.push({ kind: "file", file, depth: depth + 1 });
      }
      items.push(
        ...flattenTorrentTree(
          node.children,
          open,
          fileFilter,
          undefined,
          depth + 1
        )
      );
    }
  }
  return items;
}

function TorrentFilesSection({
  id,
  files,
  onToggle,
  type,
  path,
  onFilePriorityChange,
  onResume,
  extraFiles,
  onUpscaleDone,
  onDeleteExtraFile,
  onRedownload,
  onPlay,
}: {
  id: number;
  files: TorrentFileInfo[];
  type: "torrent" | "player";
  path?: string;
  onToggle?: (id: number, indices: number[]) => void;
  onFilePriorityChange?: (
    id: number,
    fileIndices: number[],
    priority: FilePriority
  ) => void;
  onResume?: () => void;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onUpscaleDone?: (filePath: string) => void;
  onDeleteExtraFile?: () => void;
  onRedownload?: (fileIndex: number) => void;
  onPlay?: (path: string, name: string) => void;
}) {
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);

  const items = useUpscaleQueueStore((s) => s.items);

  const queueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      m.set(item.filePath, item.status);
    }
    return m;
  }, [items]);

  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        files.filter((f) => f.selected || f.completed).map((f) => f.index)
      )
  );

  const [open, setOpen] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { nodes: trees, rootFiles } = useMemo(
    () => buildTorrentTree(files),
    [files]
  );

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const trackExts = useMemo(
    () => new Set([...audioExtensions, ...subtitleExtensions]),
    [audioExtensions, subtitleExtensions]
  );

  const fileFilter = useMemo(() => {
    if (type !== "player") return;
    const hideTracks =
      showTrackFiles === "hide" || showTrackFiles === "folders";
    return (f: TorrentTreeFile) => {
      if (!f.completed) return false;
      if (hideTracks) {
        const ext = f.name.split(".").pop()?.toLowerCase();
        if (ext && trackExts.has(ext)) return false;
      }
      return true;
    };
  }, [type, showTrackFiles, trackExts]);

  const flatItems = useMemo(() => {
    const items = flattenTorrentTree(trees, open, fileFilter, rootFiles);
    if (extraFiles && type === "player") {
      for (const file of extraFiles) {
        const extraIndex = -(2000 + items.length);
        const extraFile: TorrentTreeFileWithPath = {
          index: extraIndex,
          name: file.name,
          displayName: file.name,
          size: file.size,
          progress_bytes: file.size,
          completed: true,
          selected: false,
          priority: "normal",
          exists: true,
          _fullPath: file.fullPath,
        };
        items.push({ kind: "file", file: extraFile, depth: 0 });
      }
    }
    return items;
  }, [trees, open, fileFilter, rootFiles, extraFiles, type]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });

  const handleToggleFile = (index: number, completed: boolean) => {
    if (completed) return;
    const wasSelected = selected.has(index);
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
    onToggle?.(id, [...next]);
    if (!wasSelected) {
      if (handlePriorityChange) {
        handlePriorityChange([index], "normal");
      }
      onResume?.();
    }
  };

  const handlePriorityChange = onFilePriorityChange
    ? (fileIndices: number[], priority: FilePriority) =>
        onFilePriorityChange(id, fileIndices, priority)
    : undefined;

  return (
    <div
      ref={scrollRef}
      className="windows95-border h-fit max-h-40 overflow-y-auto bg-white py-0.5"
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = flatItems[vItem.index];
          if (!item) return null;
          if (item.kind === "folder") {
            return (
              <FolderRow
                key={`folder-${item.node.name}-${item.depth}-${vItem.index}`}
                node={item.node}
                depth={item.depth}
                virtualStart={vItem.start}
                files={files}
                isOpen={open.has(item.node.name + item.depth)}
                type={type}
                onToggleFolder={() => toggle(item.node.name + item.depth)}
                onPriorityChange={handlePriorityChange}
              />
            );
          }
          const { file } = item;
          return (
            <TorrentFileRow
              key={file.index}
              file={file}
              depth={item.depth}
              virtualStart={vItem.start}
              type={type}
              checked={selected.has(file.index)}
              onToggleFile={
                onToggle
                  ? () => handleToggleFile(file.index, file.completed)
                  : undefined
              }
              onPriorityChange={handlePriorityChange}
              queueMap={queueMap}
              extraFiles={extraFiles}
              path={path}
              onDeleteExtraFile={onDeleteExtraFile}
              onUpscaleDone={onUpscaleDone}
              onPlay={onPlay}
              onRedownload={onRedownload}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TorrentFilesSection;
