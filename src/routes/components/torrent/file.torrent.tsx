import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";

import { useHotkeys } from "@/hooks/hotkeys.hook";
import type { HotkeyDef } from "@/lib/hotkeys/chord.hotkeys";
import { clickRowActionButton, dispatchClick } from "@/lib/hotkeys/dispatch.hotkeys";
import { resolveTreeArrow, resolveTreeMove } from "@/lib/player/treeArrow.utils";
import type { TreeRow } from "@/lib/player/treeArrow.utils";
import { useCell } from "@/lib/state/signal.hook";
import {
  applyFolderSelection,
  buildTorrentTree,
  flattenTorrentTree,
} from "@/lib/torrent/tree.utils";
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

/** The player folder ring, mirrored: arrows and j/k walk folder *and* file
 *  rows with counts, Enter activates, o/p/s/e/r click the file's own buttons
 *  (s is the name search, r the context menu - the only two without buttons).
 *  Row keys carry no slashes, so every row of one section counts as a sibling
 *  for absolute jumps. */
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

const TORRENT_TREE_KEYBINDS: HotkeyDef<TorrentTreeKeyAction>[] = [
  { id: "treeCollapse", chord: "ArrowLeft", repeat: "hold" },
  { id: "treeExpand", chord: "ArrowRight", repeat: "hold" },
  { id: "treeUp", chord: "ArrowUp", repeat: "hold" },
  { id: "treeDown", chord: "ArrowDown", repeat: "hold" },
  { id: "treeUp", chord: "KeyK", repeat: "hold" },
  { id: "treeDown", chord: "KeyJ", repeat: "hold" },
  { id: "treeActivate", chord: "Enter", repeat: "once" },
  { id: "rowExternal", chord: "KeyO", repeat: "once" },
  { id: "rowBuiltin", chord: "KeyP", repeat: "once" },
  { id: "rowSearch", chord: "KeyS", repeat: "once" },
  { id: "rowUpscale", chord: "KeyE", repeat: "once" },
  { id: "rowReveal", chord: "KeyR", repeat: "once" },
];

function rowElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest<HTMLElement>("[data-tree-row]") : null;
}

/** Rows are virtualized and carry no stable DOM id, so the row is looked up by
 *  the path it renders rather than by escaping into a selector. */
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
  onOpenInApp,
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

  // Every visible row, in render order - the ring walks folders and files
  // alike, so an expanded torrent costs no tab stop per file. Folder paths
  // reuse the open set's key (`name + depth`), which `flattenTorrentTree`
  // checks too; both stay slash-free so one section's rows read as a single
  // sibling group for absolute jumps.
  const treeRows = useMemo<TreeRow[]>(
    () =>
      flatItems.map((item) =>
        item.kind === "folder"
          ? {
              path: item.node.name + item.depth,
              depth: item.depth,
              kind: "folder" as const,
              expanded: open.has(item.node.name + item.depth),
            }
          : {
              path: fileKey(item.file.index),
              depth: item.depth,
              kind: "file" as const,
              expanded: false,
            }
      ),
    [flatItems, open]
  );

  // Toggling a folder re-renders the virtual rows positionally, so the ring
  // is restored by path after the commit instead of trusting DOM identity.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const path = pendingFocus.current;
    if (!path) return;
    pendingFocus.current = null;
    findRow(scrollRef.current, path)?.focus();
  }, [open]);

  useHotkeys<TorrentTreeKeyAction>(TORRENT_TREE_KEYBINDS, {
    // Only the section holding the focused row answers, so the keys keep
    // their normal meaning everywhere else. A row button is skipped by the
    // shared filter, so only the modal guard is applied here.
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
        // Enter and S both perform the row's own button, so key and mouse can
        // never disagree about what activating a row means. S on a file row
        // is the name search; on a folder row it toggles, like Enter. Counts
        // are dropped like in every other non-motion branch.
        setVimCount("");
        row?.querySelector<HTMLElement>("[data-tree-activate]")?.click();
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
        // File rows only; a pending count has no meaning for an action.
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
      className="windows95-border bg-field h-fit max-h-40 overflow-y-auto py-0.5"
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
            />
          );
        })}
      </div>
    </div>
  );
}

export default TorrentFilesSection;
