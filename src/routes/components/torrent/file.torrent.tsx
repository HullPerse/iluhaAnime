import { buildTorrentTree, fmtSize } from "@/lib/torrent.utils";
import type { TorrentTreeNode, TorrentTreeFile } from "@/lib/torrent.utils";
import type { TorrentFileInfo, FilePriority } from "@/types/torrent";
import { useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Monitor,
} from "lucide-react";
import { openFileInPlayer } from "@/lib/media.utils";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { useSettingsStore } from "@/store/settings.store";
import UpscalePlayer from "@/routes/components/player/upscale.player";

type Item =
  | { kind: "folder"; node: TorrentTreeNode; depth: number }
  | { kind: "file"; file: TorrentTreeFile; depth: number };

function flattenTree(
  nodes: TorrentTreeNode[],
  open: Set<string>,
  fileFilter?: (f: TorrentTreeFile) => boolean,
  rootFiles?: TorrentTreeFile[],
  depth = 0,
): Item[] {
  const items: Item[] = [];

  if (depth === 0 && rootFiles) {
    for (const file of rootFiles) {
      items.push({ kind: "file", file, depth: 0 });
    }
  }

  for (const node of nodes) {
    if (depth > 0) items.push({ kind: "folder", node, depth });
    if (open.has(node.name + depth)) {
      const files = fileFilter ? node.files.filter(fileFilter) : node.files;
      for (const file of files) {
        items.push({ kind: "file", file, depth: depth + 1 });
      }
      items.push(...flattenTree(node.children, open, fileFilter, undefined, depth + 1));
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
  extraFiles,
  onUpscaleDone,
}: {
  id: number;
  files: TorrentFileInfo[];
  type: "torrent" | "player";
  path?: string;
  onToggle?: (id: number, indices: number[]) => void;
  onFilePriorityChange?: (
    id: number,
    fileIndices: number[],
    priority: FilePriority,
  ) => void;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onUpscaleDone?: (filePath: string) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        files.filter((f) => f.selected || f.completed).map((f) => f.index),
      ),
  );

  const [open, setOpen] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { nodes: trees, rootFiles } = useMemo(() => buildTorrentTree(files), [files]);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);

  const trackExts = useMemo(
    () => new Set([...audioExtensions, ...subtitleExtensions]),
    [audioExtensions, subtitleExtensions],
  );

  const fileFilter = useMemo(() => {
    if (type !== "player") return undefined;
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
    const items = flattenTree(trees, open, fileFilter, rootFiles);
    if (extraFiles && type === "player") {
      for (const ef of extraFiles) {
        items.push({
          kind: "file",
          file: { index: -1, name: ef.name, displayName: ef.name, size: ef.size, completed: true, selected: false, priority: "normal", exists: true, _fullPath: ef.fullPath } as TorrentTreeFile & { _fullPath: string },
          depth: 0,
        });
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
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
    onToggle?.(id, [...next]);
  };

  const handlePriorityChange = onFilePriorityChange
    ? (fileIndices: number[], priority: FilePriority) =>
      onFilePriorityChange(id, fileIndices, priority)
    : undefined;

  return (
    <div
      ref={scrollRef}
      className="windows95-border h-fit max-h-40 overflow-y-auto bg-white"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = flatItems[vItem.index];
          if (!item) return null;
          if (item.kind === "folder") {
            const isOpen = open.has(item.node.name + item.depth);
            return (
              <div
                key={item.node.name + item.depth}
                role="button"
                className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left select-none absolute top-0 left-0"
                style={{
                  height: 20,
                  transform: `translateY(${vItem.start}px)`,
                  paddingLeft: `${item.depth * 12 + 2}px`,
                }}
                onClick={() => toggle(item.node.name + item.depth)}
              >
                {isOpen ? (
                  <ChevronDown className="size-3 shrink-0" />
                ) : (
                  <ChevronRight className="size-3 shrink-0" />
                )}
                <FolderOpen className="size-3 shrink-0 text-muted" />
                <span className="truncate font-bold" title={item.node.name}>
                  {item.node.name}
                </span>
                <span className="text-muted ml-auto whitespace-nowrap">
                  {fmtSize(
                    item.node.files.reduce((s, f) => s + f.size, 0) +
                    item.node.children.reduce(
                      (s, c) => s + c.files.reduce((s2, f) => s2 + f.size, 0),
                      0,
                    ),
                  )}
                </span>
              </div>
            );
          }
          const file = item.file;
          return (
            <label
              key={file.index}
              className={`flex items-center gap-1 px-1 w-full windows95-text select-none absolute top-0 left-0 ${type === "player" ? "" : "hover:bg-surface"}`}
              style={{
                height: 20,
                transform: `translateY(${vItem.start}px)`,
                paddingLeft: `${item.depth * 12 + 2}px`,
              }}
            >
              {onToggle && (
                <Checkbox
                  checked={selected.has(file.index)}
                  onChange={() => handleToggleFile(file.index, file.completed)}
                  disabled={file.completed}
                  className="size-3"
                />
              )}



              <span className="truncate flex-1" title={file.displayName}>
                {file.displayName}
              </span>

              <span className="text-muted shrink-0">{fmtSize(file.size)}</span>

              {handlePriorityChange &&
                type === "torrent" &&
                !file.completed && (
                  <Select
                    className="w-20"
                    value={file.priority || "normal"}
                    onChange={(v) =>
                      handlePriorityChange([file.index], v as FilePriority)
                    }
                    options={[
                      { value: "high", label: "Высокий" },
                      { value: "normal", label: "Нормальный" },
                      { value: "low", label: "Маленький" },
                      { value: "do_not_download", label: "Пропуск" },
                    ]}
                    arrow={false}
                  />
                )}

              {type === "player" && (
                <div className="flex flex-row gap-1 ml-auto">
                  {(file as TorrentTreeFile & { _fullPath?: string })._fullPath
                    ? (
                      <>
                        <UpscalePlayer filePath={(file as TorrentTreeFile & { _fullPath: string })._fullPath} onDone={onUpscaleDone} />
                        <Button
                          title="Открыть в медиа плеере"
                          size="icon"
                          className="size-4"
                          onClick={async () => openFileInPlayer((file as TorrentTreeFile & { _fullPath: string })._fullPath)}
                        >
                          <Monitor className="size-2.5" />
                        </Button>
                      </>
                    )
                    : (
                      <>
                        {path && <UpscalePlayer filePath={`${path}/${file.name}`} onDone={onUpscaleDone} />}
                          {path && (
                          <Button
                            title="Открыть в медиа плеере"
                            size="icon"
                            className="size-4"
                            onClick={async () => {
                              if (!path) return;
                              openFileInPlayer(`${path}/${file.name}`);
                            }}
                          >
                            <Monitor className="size-2.5" />
                          </Button>
                        )}
                      </>
                    )
                  }
                </div>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default TorrentFilesSection;
