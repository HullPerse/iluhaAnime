import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, useCallback, useMemo } from "react";

import {
  applyFolderSelection,
  buildTorrentTree,
  flattenTorrentTree,
} from "@/lib/torrent/tree.utils";
import { TorrentFileRow } from "@/routes/components/torrent/rows/file.rows";
import { FolderRow } from "@/routes/components/torrent/rows/folder.rows";
import { useSettingsStore } from "@/store/settings.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type {
  FilePriority,
  TorrentFileInfo,
  TorrentTreeFile,
  TorrentTreeFileWithPath,
} from "@/types/torrent";

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
  sequentialFile,
}: {
  id: number;
  files: TorrentFileInfo[];
  type: "torrent" | "player";
  path?: string;
  sequentialFile?: number | null;
  onToggle?: (id: number, indices: number[]) => void;
  onFilePriorityChange?: (id: number, fileIndices: number[], priority: FilePriority) => void;
  onResume?: () => void;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onUpscaleDone?: (filePath: string) => void;
  onDeleteExtraFile?: () => void;
  onRedownload?: (fileIndex: number) => void;
  onPlay?: (path: string, name: string) => void;
}) {
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const fileOrder = useSettingsStore((s) => s.fileOrder);
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

  const [open, setOpen] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { nodes: trees, rootFiles } = useMemo(
    () => buildTorrentTree(files, fileOrder),
    [files, fileOrder]
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
    const hideTracks = showTrackFiles === "hide" || showTrackFiles === "folders";
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
          fullPath: file.fullPath,
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

  const handleToggleFile = (index: number, completed: boolean, selected: boolean) => {
    if (completed) return;
    onFilePriorityChange?.(id, [index], selected ? "do_not_download" : "normal");
    if (!selected) onResume?.();
  };

  const handleToggleFolder = (indices: number[], target: boolean) => {
    onToggle?.(id, applyFolderSelection(files, indices, target));
    if (target) onResume?.();
  };

  return (
    <div
      ref={scrollRef}
      className="windows95-border bg-field h-fit max-h-40 overflow-y-auto py-0.5"
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
                onToggleSelection={handleToggleFolder}
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
              checked={file.selected || file.completed}
              onToggleFile={
                onFilePriorityChange
                  ? () => handleToggleFile(file.index, file.completed, file.selected)
                  : undefined
              }
              queueMap={queueMap}
              extraFiles={extraFiles}
              path={path}
              onDeleteExtraFile={onDeleteExtraFile}
              onUpscaleDone={onUpscaleDone}
              onPlay={onPlay}
              onRedownload={onRedownload}
              sequential={sequentialFile === file.index}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TorrentFilesSection;
