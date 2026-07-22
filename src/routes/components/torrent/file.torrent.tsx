import { buildTorrentTree, fmtSize } from "@/lib/torrent.utils";
import type { TorrentTreeNode, TorrentTreeFile } from "@/lib/torrent.utils";
import type { TorrentFileInfo, FilePriority } from "@/types/torrent";
import { useRef, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronRight, Monitor, RefreshCw } from "lucide-react";
import ImageComponent from "@/components/ui/image.component";
import { openFileInPlayer } from "@/lib/media.utils";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Select from "@/components/ui/select.component";
import { useSettingsStore } from "@/store/settings.store";
import UpscalePlayer from "@/routes/components/player/upscale.player";
import { parse } from "anitomy";
import { formatParsedTitle } from "@/lib/player.utils";
import { useSearchStore } from "@/store/search.store";
import { collectFileIndices } from "@/lib/index.utils";
import { openPath } from "@tauri-apps/plugin-opener";

type TorrentTreeFileWithPath = TorrentTreeFile & { _fullPath: string };

type Item =
  | { kind: "folder"; node: TorrentTreeNode; depth: number }
  | { kind: "file"; file: TorrentTreeFile; depth: number };

function flattenTorrentTree(
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
          depth + 1,
        ),
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
  onResume?: () => void;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onUpscaleDone?: (filePath: string) => void;
  onDeleteExtraFile?: () => void;
  onRedownload?: (fileIndex: number) => void;
}) {
  const setAnilistSearchQuery = useSearchStore(
    (state) => state.setAnilistSearchQuery,
  );

  const parseTitles = useSettingsStore((s) => s.parseTitles);
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);

  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        files.filter((f) => f.selected || f.completed).map((f) => f.index),
      ),
  );

  const [open, setOpen] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { nodes: trees, rootFiles } = useMemo(
    () => buildTorrentTree(files),
    [files],
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
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = flatItems[vItem.index];
          if (!item) return null;
          if (item.kind === "folder") {
            const isOpen = open.has(item.node.name + item.depth);
            const folderIndices = collectFileIndices(item.node);
            const folderFiles = folderIndices
              .map((i) => files.find((f) => f.index === i))
              .filter((f): f is TorrentFileInfo => f !== undefined);
            const folderPriority =
              folderFiles.length > 0 &&
              folderFiles.every((f) => f.priority === folderFiles[0].priority)
                ? folderFiles[0].priority
                : "normal";
            return (
              <div
                key={`folder-${item.node.name}-${item.depth}-${vItem.index}`}
                className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left select-none absolute top-0 left-0"
                style={{
                  height: 20,
                  transform: `translateY(${vItem.start}px)`,
                  paddingLeft: `${item.depth * 12 + 2}px`,
                }}
              >
                <div
                  className="flex items-center gap-1 flex-1 min-w-0"
                  onClick={() => toggle(item.node.name + item.depth)}
                >
                  {isOpen ? (
                    <ChevronDown className="size-3 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" />
                  )}
                  <ImageComponent
                    src="/images/w2k_folder_closed.ico"
                    alt=""
                    className="size-4 shrink-0"
                  />
                  <span className="truncate font-bold" title={item.node.name}>
                    {item.node.name}
                  </span>
                  <span className="text-muted whitespace-nowrap">
                    {fmtSize(
                      item.node.files.reduce((s, f) => s + f.size, 0) +
                        item.node.children.reduce(
                          (s, c) =>
                            s +
                            c.files.reduce((s2, f) => s2 + f.size, 0) +
                            c.children.reduce(
                              (s3, cc) =>
                                s3 + cc.files.reduce((s4, f) => s4 + f.size, 0),
                              0,
                            ),
                          0,
                        ),
                    )}
                  </span>
                </div>
                {handlePriorityChange && type === "torrent" && (
                  <Select
                    className="w-28"
                    value={folderPriority}
                    onChange={(v) =>
                      handlePriorityChange(folderIndices, v as FilePriority)
                    }
                    options={[
                      { value: "normal", label: "Нормальный" },
                      { value: "do_not_download", label: "Пропуск" },
                    ]}
                    arrow={false}
                  />
                )}
              </div>
            );
          }
          const file = item.file;
          return (
            <div
              key={file.index}
              className={`flex items-center gap-1 px-1 w-full windows95-text select-none absolute top-0 left-0 ${type === "torrent" && file.completed ? "" : "hover:bg-surface hover:cursor-pointer"}`}
              style={{
                height: 18,
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

              <ImageComponent
                src="/images/w2k_wmp_11.ico"
                alt=""
                className="size-4"
              />

              <span
                className="truncate flex-1"
                title={file.displayName}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (type === "player") openPath(String(path));
                }}
                onClick={() => {
                  if (type === "torrent") return;
                  const parsed = parse(file.displayName);
                  if (!parsed) return;
                  setAnilistSearchQuery(String(parsed.title));
                }}
              >
                {type === "player" && parseTitles
                  ? formatParsedTitle(file.displayName)
                  : file.displayName}
              </span>

              {file.selected && !file.completed && file.size > 0 && (
                <div className="w-10 h-2 bg-surface windows95-border shrink-0 ml-1">
                  <div
                    className="h-full bg-secondary transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (file.progress_bytes / file.size) * 100)}%`,
                    }}
                  />
                </div>
              )}

              <span className="text-muted shrink-0">{fmtSize(file.size)}</span>

              {handlePriorityChange &&
                type === "torrent" &&
                !file.completed && (
                  <Select
                    className="w-28"
                    value={file.priority || "normal"}
                    onChange={(v) =>
                      handlePriorityChange([file.index], v as FilePriority)
                    }
                    options={[
                      { value: "normal", label: "Нормальный" },
                      { value: "do_not_download", label: "Пропуск" },
                    ]}
                    arrow={false}
                  />
                )}

              {type === "torrent" &&
                file.completed &&
                !file.exists &&
                onRedownload && (
                  <Button
                    title="Загрузить заново"
                    size="icon"
                    className="size-4"
                    onClick={() => onRedownload(file.index)}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                )}

              {type === "player" && (
                <div className="flex flex-row gap-1 ml-auto">
                  {(file as TorrentTreeFileWithPath)._fullPath ? (
                    <>
                      <Button
                        rendered={
                          !!extraFiles?.find((e) => e.name === file.displayName)
                        }
                        title="Удалить"
                        size="icon"
                        className="size-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          const upscaledFile = extraFiles?.find(
                            (e) => e.name === file.displayName,
                          );

                          if (!upscaledFile?.fullPath) return;

                          invoke("delete_extra_file", {
                            path: upscaledFile.fullPath,
                          }).catch(() => {});

                          onDeleteExtraFile?.();
                        }}
                        disabled={
                          !extraFiles?.find((e) => e.name === file.displayName)
                        }
                      >
                        <ImageComponent
                          src="/images/w2k_dustbin.ico"
                          alt=""
                          className="size-4"
                        />
                      </Button>

                      <UpscalePlayer
                        filePath={(file as TorrentTreeFileWithPath)._fullPath}
                        onDone={onUpscaleDone}
                        exists={file.exists}
                      />
                      <Button
                        title="Открыть в медиа плеере"
                        size="icon"
                        className="size-4"
                        onClick={async (e) => {
                          e.stopPropagation();
                          openFileInPlayer(
                            (file as TorrentTreeFileWithPath)._fullPath,
                          );
                        }}
                        disabled={!file.exists}
                      >
                        <Monitor className="size-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {path && (
                        <UpscalePlayer
                          filePath={`${path}/${file.name}`}
                          exists={file.exists}
                          onDone={onUpscaleDone}
                        />
                      )}
                      {path && (
                        <Button
                          title="Открыть в медиа плеере"
                          size="icon"
                          className="size-4"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!path) return;
                            openFileInPlayer(`${path}/${file.name}`);
                          }}
                          disabled={!file.exists}
                        >
                          <Monitor className="size-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TorrentFilesSection;
