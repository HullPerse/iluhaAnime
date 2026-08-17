import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { parse } from "anitomy";
import {
  ChevronDown,
  ChevronRight,
  ListVideo,
  Monitor,
  Play,
  RefreshCw,
} from "lucide-react";
import { useRef, useState, useCallback, useMemo } from "react";

import { SmallLoader } from "@/components/shared/loader.component";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/i18n";
import { collectFileIndices } from "@/lib/index.utils";
import { joinMediaPath, openFileInPlayer } from "@/lib/media.utils";
import { formatParsedTitle } from "@/lib/player.utils";
import { buildTorrentTree, fmtSize } from "@/lib/torrent.utils";
import type { TorrentTreeNode, TorrentTreeFile } from "@/lib/torrent.utils";
import UpscalePlayer from "@/routes/components/player/upscale.player";
import { useSearchStore } from "@/store/search.store";
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
  const setAnilistSearchQuery = useSearchStore(
    (state) => state.setAnilistSearchQuery
  );

  const parseTitles = useSettingsStore((s) => s.parseTitles);
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);
  const { t } = useI18n();

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
                className="windows95-text hover:bg-surface absolute top-0 left-0 flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none"
                style={{
                  height: 20,
                  transform: `translateY(${vItem.start}px)`,
                  paddingLeft: `${item.depth * 12 + 2}px`,
                }}
              >
                <div
                  className="flex min-w-0 flex-1 items-center gap-1"
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
                              0
                            ),
                          0
                        )
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
                      { value: "normal", label: t("torrent.priority.normal") },
                      {
                        value: "do_not_download",
                        label: t("torrent.priority.skip"),
                      },
                    ]}
                    arrow={false}
                  />
                )}
              </div>
            );
          }
          const { file } = item;
          return (
            <div
              key={file.index}
              className={`windows95-text absolute top-0 left-0 flex w-full items-center gap-1 px-1 select-none ${type === "torrent" && file.completed ? "" : "hover:bg-surface hover:cursor-pointer"}`}
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
                className="flex-1 truncate"
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
                  ? formatParsedTitle(file.displayName, t)
                  : file.displayName}
              </span>

              {file.selected && !file.completed && file.size > 0 && (
                <div className="bg-surface windows95-border ml-1 h-2 w-10 shrink-0">
                  <div
                    className="bg-secondary h-full transition-all duration-500"
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
                      { value: "normal", label: t("torrent.priority.normal") },
                      {
                        value: "do_not_download",
                        label: t("torrent.priority.skip"),
                      },
                    ]}
                    arrow={false}
                  />
                )}

              {type === "torrent" &&
                file.completed &&
                !file.exists &&
                onRedownload && (
                  <Button
                    title={t("torrent.redownload")}
                    size="icon"
                    className="size-4"
                    onClick={() => onRedownload(file.index)}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                )}

              {type === "player" && (
                <div className="ml-auto flex flex-row gap-1">
                  {(file as TorrentTreeFileWithPath)._fullPath ? (
                    <>
                      <Button
                        rendered={
                          !!extraFiles?.find((e) => e.name === file.displayName)
                        }
                        title={t("common.delete")}
                        size="icon"
                        className="size-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          const upscaledFile = extraFiles?.find(
                            (e) => e.name === file.displayName
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

                      {(() => {
                        const status = queueMap.get(
                          (file as TorrentTreeFileWithPath)._fullPath
                        );
                        if (!status) return null;
                        if (status === "queued")
                          return <ListVideo className="text-muted size-3" />;
                        if (status === "processing")
                          return <SmallLoader size={3} className="text-highlight" />;
                        return null;
                      })()}

                      <UpscalePlayer
                        filePath={(file as TorrentTreeFileWithPath)._fullPath}
                        onDone={onUpscaleDone}
                        exists={file.exists}
                      />
                      {onPlay && (
                        <Button
                          title={t("player.folder.builtinPlayer")}
                          size="icon"
                          className="size-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlay(
                              (file as TorrentTreeFileWithPath)._fullPath,
                              file.displayName
                            );
                          }}
                          disabled={!file.exists}
                        >
                          <Play className="size-3" />
                        </Button>
                      )}
                      <Button
                        title={t("player.folder.openMediaPlayer")}
                        size="icon"
                        className="size-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFileInPlayer(
                            (file as TorrentTreeFileWithPath)._fullPath
                          ).catch(() => {});
                        }}
                        disabled={!file.exists}
                      >
                        <Monitor className="size-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {(() => {
                        if (!path) return null;
                        const status = queueMap.get(
                          joinMediaPath(path, file.name)
                        );
                        if (!status) return null;
                        if (status === "queued")
                          return <ListVideo className="text-muted size-3" />;
                        if (status === "processing")
                          return <SmallLoader size={3} className="text-highlight" />;
                        return null;
                      })()}

                      {path && (
                        <UpscalePlayer
                          filePath={joinMediaPath(path, file.name)}
                          exists={file.exists}
                          onDone={onUpscaleDone}
                        />
                      )}
                      {path && onPlay && (
                        <Button
                          title={t("player.folder.builtinPlayer")}
                          size="icon"
                          className="size-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlay(
                              joinMediaPath(path, file.name),
                              file.displayName
                            );
                          }}
                          disabled={!file.exists}
                        >
                          <Play className="size-3" />
                        </Button>
                      )}
                      {path && (
                        <Button
                          title={t("player.folder.openMediaPlayer")}
                          size="icon"
                          className="size-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (path) {
                              openFileInPlayer(
                                joinMediaPath(path, file.name)
                              ).catch(() => {});
                            }
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
