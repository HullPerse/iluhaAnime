import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";

import { TORRENT_LIST_MAX_HEIGHT } from "@/config/torrents.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import { clickRowActionButton, dispatchClick } from "@/lib/dispatchHotkeys.utils";
import { mediaFileExtension } from "@/lib/parse.utils";
import { resolveTreeArrow, resolveTreeMove } from "@/lib/treeArrow.utils";
import type { TreeRow } from "@/lib/treeArrow.utils";
import { useCell } from "@/lib/signal.hook";
import {
  applyFolderSelection,
  buildTorrentTree,
  flattenTorrentTree,
} from "@/lib/torrentTree.utils";
import { TorrentFileRow } from "@/routes/components/torrent/rows/file.rows";
import { FolderRow } from "@/routes/components/torrent/rows/folder.rows";
import { settingsAtoms } from "@/store/settings.store";
import { upscaleItems } from "@/store/upscale.store";
import { setVimCount, vimAtoms } from "@/store/vim.store";
import type {
  FilePriority,
  TorrentFileInfo,
  TorrentTreeFile,
  TorrentTreeFileWithPath,
} from "@/types/torrent";

type TorrentTreeKeyAction =
  | "treeCollapse"
  | "treeExpand"
  | "treeUp"
  | "treeDown"
  | "treeActivate"
  | "rowExternal"
  | "rowBuiltin"
  | "rowSearch"
  | "rowUpscale"
  | "rowReveal";

const TORRENT_TREE_KEYBINDS: ResolvedHotkeyDef<TorrentTreeKeyAction>[] = [
  { id: "treeCollapse", chord: "ArrowLeft", repeat: "hold", keybindId: "tree.collapse" },
  { id: "treeExpand", chord: "ArrowRight", repeat: "hold", keybindId: "tree.expand" },
  { id: "treeUp", chord: "ArrowUp", repeat: "hold", keybindId: "tree.move.up" },
  { id: "treeDown", chord: "ArrowDown", repeat: "hold", keybindId: "tree.move.down" },
  { id: "treeUp", chord: "KeyK", repeat: "hold", keybindId: "tree.move.up" },
  { id: "treeDown", chord: "KeyJ", repeat: "hold", keybindId: "tree.move.down" },
  { id: "treeActivate", chord: "Enter", repeat: "once", keybindId: "tree.activate" },
  { id: "rowExternal", chord: "KeyO", repeat: "once", keybindId: "tree.external" },
  { id: "rowBuiltin", chord: "KeyP", repeat: "once", keybindId: "tree.builtin" },
  { id: "rowSearch", chord: "KeyS", repeat: "once", keybindId: "tree.search" },
  { id: "rowUpscale", chord: "KeyE", repeat: "once", keybindId: "tree.upscale" },
  { id: "rowReveal", chord: "KeyR", repeat: "once", keybindId: "tree.reveal" },
];

function rowElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest<HTMLElement>("[data-tree-row]") : null;
}

function findRow(root: HTMLElement | null, path: string): HTMLElement | null {
  if (!root) return null;
  for (const row of root.querySelectorAll<HTMLElement>("[data-tree-row]")) {
    if (row.dataset.treePath === path) return row;
  }
  return null;
}

function fileKey(index: number): string {
  return `file:${index}`;
}

type TorrentFileRowAction = "external" | "builtin" | "upscale" | "reveal";

const TORRENT_FILE_ACTION_BY_KEY: Partial<Record<TorrentTreeKeyAction, TorrentFileRowAction>> = {
  rowExternal: "external",
  rowBuiltin: "builtin",
  rowUpscale: "upscale",
  rowReveal: "reveal",
};

function runTorrentFileRowAction(row: HTMLElement, action: TorrentFileRowAction): void {
  if (action === "reveal") {
    const name = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (name) dispatchClick(name, "contextmenu");
    return;
  }
  clickRowActionButton(row, action);
}

function activateTorrentRow(row: HTMLElement): void {
  setVimCount("");
  if (row.dataset.treeKind === "file") {
    row.querySelector<HTMLElement>('[data-file-action="search"]')?.click();
  } else {
    row.querySelector<HTMLElement>("[data-tree-activate]")?.click();
  }
}

function TorrentFilesSection({
  id,
  files,
  onToggle,
  type,
  path,
  listHeight,
  onFilePriorityChange,
  onResume,
  extraFiles,
  onUpscaleDone,
  onDeleteExtraFile,
  onRedownload,
  onPlay,
  onOpenInApp,
  sequentialFile,
  queuePositions,
}: {
  id: number;
  files: TorrentFileInfo[];
  type: "torrent" | "player";
  path?: string;
  /** Fixed list height for the resizable player cards; undefined keeps the default cap. */
  listHeight?: number;
  sequentialFile?: number | null;
  queuePositions?: Map<number, number>;
  onToggle?: (id: number, indices: number[]) => void;
  onFilePriorityChange?: (id: number, fileIndices: number[], priority: FilePriority) => void;
  onResume?: () => void;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onUpscaleDone?: () => void;
  onDeleteExtraFile?: () => void;
  onRedownload?: (fileIndex: number) => void;
  onPlay?: (path: string, name: string) => void;
  onOpenInApp?: (fullPath: string) => void;
}) {
  const showTrackFiles = useCell(settingsAtoms.showTrackFiles);
  const fileOrder = useCell(settingsAtoms.fileOrder);
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);

  const items = useCell(upscaleItems);

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
        const ext = mediaFileExtension(f.name);
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
          on_disk_bytes: file.size,
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

  const treeRows = useMemo<TreeRow[]>(() => {
    const stack: string[] = [];
    return flatItems.map((item, index) => {
      const path = item.kind === "folder" ? item.node.name + item.depth : fileKey(item.file.index);
      const parent = item.depth === 0 ? "" : (stack[item.depth - 1] ?? "");
      stack[item.depth] = String(index);
      stack.length = item.depth + 1;
      return item.kind === "folder"
        ? {
            path,
            depth: item.depth,
            kind: "folder" as const,
            expanded: open.has(path),
            parent,
          }
        : {
            path,
            depth: item.depth,
            kind: "file" as const,
            expanded: false,
            parent,
          };
    });
  }, [flatItems, open]);

  const [anchorPath, setAnchorPath] = useState<string | null>(null);

  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const path = pendingFocus.current;
    if (!path) return;
    pendingFocus.current = null;
    findRow(scrollRef.current, path)?.focus();
  }, [open]);

  useResolvedHotkeys<TorrentTreeKeyAction>(TORRENT_TREE_KEYBINDS, {
    ignore: (event) => {
      const row = rowElement(event.target);
      if (!row || !scrollRef.current?.contains(row)) return true;
      return Boolean(row.closest("[data-hotkeys-disabled]"));
    },
    onAction: (action, event) => {
      const row = rowElement(event.target);
      const path = row?.dataset.treePath;
      if (!path) return;

      if (action === "treeActivate" || action === "rowSearch") {
        activateTorrentRow(row);
        return;
      }

      if (action === "treeUp" || action === "treeDown") {
        const count = vimAtoms.count.get();
        setVimCount("");
        const step = count === "" ? 1 : Math.max(Number.parseInt(count, 10) || 1, 1);
        const next = resolveTreeMove(treeRows, path, (action === "treeUp" ? -1 : 1) * step);
        if (next) findRow(scrollRef.current, next)?.focus();
        return;
      }

      const torrentFileAction = TORRENT_FILE_ACTION_BY_KEY[action];
      if (torrentFileAction !== undefined) {
        setVimCount("");
        if (row.dataset.treeKind !== "file") return;
        runTorrentFileRowAction(row, torrentFileAction);
        return;
      }

      const result = resolveTreeArrow(treeRows, path, action === "treeCollapse" ? "left" : "right");
      if (!result) return;
      if (result.kind === "focus") {
        findRow(scrollRef.current, result.path)?.focus();
        return;
      }
      pendingFocus.current = result.path;
      toggle(result.path);
    },
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
      data-virtual-list
      data-tree-root
      data-torrent-file-list
      className="windows95-border bg-field h-fit overflow-y-auto py-0.5"
      style={{
        maxHeight: listHeight ?? TORRENT_LIST_MAX_HEIGHT,
        minHeight: listHeight,
      }}
      onFocus={(event) => {
        const row = rowElement(event.target);
        if (!row || !scrollRef.current?.contains(row)) return;
        const path = row.dataset.treePath;
        if (path) setAnchorPath(path);
      }}
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = flatItems[vItem.index];
          if (!item) return null;
          if (item.kind === "folder") {
            const key = item.node.name + item.depth;
            return (
              <FolderRow
                key={`folder-${item.node.name}-${item.depth}-${vItem.index}`}
                node={item.node}
                depth={item.depth}
                virtualStart={vItem.start}
                files={files}
                isOpen={open.has(key)}
                type={type}
                treePath={key}
                rows={treeRows}
                anchorPath={anchorPath}
                onToggleFolder={() => toggle(key)}
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
              rows={treeRows}
              anchorPath={anchorPath}
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
              onOpenInApp={onOpenInApp}
              onRedownload={onRedownload}
              sequential={sequentialFile === file.index}
              queuePosition={queuePositions?.get(file.index)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TorrentFilesSection;
