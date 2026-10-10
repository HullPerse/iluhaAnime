import { useVirtualizer } from "@tanstack/react-virtual";
import { openPath } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import {
  ChevronDown,
  ChevronRight,
  ListVideo,
  Monitor,
  EyeOff,
  Play,
  Search,
  X,
} from "lucide-react";
import { useState, useRef, useMemo, useCallback, type RefObject } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { FOLDER_LIST_MAX_HEIGHT, FOLDER_VIRTUALIZE_AFTER } from "@/config/player/folders.config";
import { useI18n } from "@/hooks/i18n.hook";
import { parseMediaPath } from "@/lib/media/parse.utils";
import { loadWatch, openPlayer } from "@/lib/player/playback.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { findFolderContainingFile, flattenTree, folderFilePaths } from "@/lib/player/tree.utils";
import { useCell } from "@/lib/state/signal.hook";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { openFileInPlayer } from "@/lib/utils/media.utils";
import { showError } from "@/lib/utils/notification.utils";
import { setAnilistSearchQuery } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import { upscaleItems } from "@/store/upscale.store";
import type { FolderNode } from "@/types/torrent";

import UpscalePlayer from "./upscale/modal.upscale";

function FolderView({
  node,
  depth,
  searchQuery,
  onRemove,
  onGenerate,
  onHide,
  isGenerating,
  disabledExtensions,
  hideRoot,
  contentSized,
  listMaxHeight,
  listMinHeight,
  scrollRef,
}: {
  node: FolderNode;
  depth: number;
  searchQuery: string;
  onRemove?: (path: string) => void;
  onGenerate?: (path: string, name: string) => void;
  onHide?: (path: string) => void;
  isGenerating?: boolean;
  disabledExtensions?: Set<string>;
  hideRoot?: boolean;
  contentSized?: boolean;
  listMaxHeight?: number;
  listMinHeight?: number;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const showTrackFiles = useCell(settingsAtoms.showTrackFiles);
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);
  const parseTitles = useCell(settingsAtoms.parseTitlesPlayer);
  const { t } = useI18n();

  const items = useCell(upscaleItems);

  const queueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      m.set(item.filePath, item.status);
    }
    return m;
  }, [items]);

  const trackExts = useMemo(
    () =>
      showTrackFiles === "hide" || showTrackFiles === "torrent"
        ? new Set([...audioExtensions, ...subtitleExtensions])
        : undefined,
    [showTrackFiles, audioExtensions, subtitleExtensions]
  );

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(node.children.length > 0 ? [node.path] : [])
  );
  const localScrollRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = scrollRef ?? localScrollRef;

  const toggle = useCallback((path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const openInAppPlayer = useCallback(
    async (path: string) => {
      const stored = await loadWatch(path).catch(() => null);
      const folder = findFolderContainingFile(node, path);
      const paths = folder ? folderFilePaths(folder) : [];
      const index = paths.indexOf(path);
      const resume = stored && stored.position > 0 ? stored.position : undefined;
      // Keep the queue in its sorted order and let the backend start at the
      // chosen episode, so the playlist reads 1..N instead of rotating.
      await openPlayer(paths.length > 0 ? paths : [path], resume, Math.max(index, 0)).catch(
        (error: unknown) => {
          showError(t("player.folder.open.failed.player"), String(error));
        }
      );
    },
    [node, t]
  );

  const flatItems = useMemo(
    () => flattenTree(node, open, searchQuery, disabledExtensions, depth, trackExts),
    [node, open, searchQuery, disabledExtensions, depth, trackExts]
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });

  const isDisabled = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (!ext) return false;
    return (
      disabledExtensions?.has(ext) === true ||
      audioExtensions.includes(ext) ||
      subtitleExtensions.includes(ext)
    );
  };

  const countAll = node.files.length + node.children.reduce((s, c) => s + c.files.length, 0);

  if (flatItems.length === 0) return null;

  const showHeader = !hideRoot || depth > 0;

  return (
    <div className="flex w-full flex-col">
      {showHeader && (
        <div
          className="windows95-text flex w-full items-center gap-1 px-0.5 py-0.5"
          style={{
            paddingLeft: `${depth * 12 + 2}px`,
          }}
        >
          <button
            type="button"
            aria-expanded={open.has(node.path)}
            aria-label={node.name}
            className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            onClick={() => toggle(node.path)}
          >
            {open.has(node.path) ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
            <ImageComponent
              src="/images/w2k_folder_closed.ico"
              alt=""
              className="size-4 shrink-0"
            />
            <span className="truncate select-none" title={node.name}>
              {node.name}
            </span>
          </button>
          {onHide && (
            <Button
              size="icon"
              className="h-5 w-5 shrink-0"
              title={t("player.visibility.hide")}
              onClick={(e) => {
                e.stopPropagation();
                onHide(node.path);
              }}
            >
              <EyeOff className="size-3" />
            </Button>
          )}
          {depth === 0 && (
            <>
              <span className="text-hint text-xs whitespace-nowrap select-none">
                {t("player.folder.file.count", { count: countAll })}
              </span>
              {onGenerate && (
                <Button
                  size="icon"
                  className="h-5 w-5"
                  title={t("player.folder.generate.preview")}
                  disabled={isGenerating}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate(node.path, node.name);
                  }}
                >
                  <ImageComponent
                    src="/images/w2k_bitmap_image.ico"
                    alt=""
                    className="size-4 bg-transparent"
                  />
                </Button>
              )}
              {onRemove && (
                <Button
                  size="icon"
                  className="h-5 w-5"
                  title={t("common.delete")}
                  aria-label={t("common.delete")}
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
      )}

      {open.has(node.path) && (
        <div
          ref={scrollElementRef}
          data-no-wheel
          className="overflow-y-auto"
          style={{
            maxHeight: contentSized
              ? listMaxHeight
              : (listMaxHeight ??
                (flatItems.length > FOLDER_VIRTUALIZE_AFTER ? FOLDER_LIST_MAX_HEIGHT : undefined)),
            minHeight: listMinHeight,
          }}
        >
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vItem, index) => {
              const item = flatItems[vItem.index];
              if (!item) return null;

              if (item.kind === "folder") {
                const isFolderOpen = open.has(item.node.path);
                return (
                  <div
                    key={index}
                    className="windows95-text absolute top-0 left-0 flex w-full items-center gap-1 px-0.5 py-0.5"
                    style={{
                      height: 20,
                      transform: `translateY(${vItem.start}px)`,
                      paddingLeft: `${item.depth * 12 + 2}px`,
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isFolderOpen}
                      aria-label={item.node.name}
                      className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
                      onClick={() => toggle(item.node.path)}
                    >
                      {isFolderOpen ? (
                        <ChevronDown className="size-3 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0" />
                      )}
                      <ImageComponent
                        src="/images/w2k_folder_closed.ico"
                        alt=""
                        className="size-4 shrink-0 bg-transparent"
                      />
                      <span className="truncate select-none" title={item.node.name}>
                        {item.node.name}
                      </span>
                    </button>
                    {onHide && (
                      <Button
                        size="icon"
                        className="h-4 w-4 shrink-0"
                        title={t("player.visibility.hide")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onHide(item.node.path);
                        }}
                      >
                        <EyeOff className="size-3" />
                      </Button>
                    )}
                  </div>
                );
              }

              const { file } = item;
              const disabled = isDisabled(file.name);
              const queueStatus = file.path ? queueMap.get(file.path) : undefined;
              const busy = queueStatus === "queued" || queueStatus === "processing";

              return (
                <div
                  key={index}
                  className={cn(
                    "windows95-border hover:bg-surface bg-field absolute top-0 left-0 flex h-5 w-full items-center gap-1 px-1 hover:cursor-pointer",
                    busy && "opacity-50"
                  )}
                  style={{
                    transform: `translateY(${vItem.start}px)`,
                    paddingLeft: `${item.depth * 12 + 2}px`,
                  }}
                >
                  <ImageComponent src="/images/w2k_wmp_11.ico" alt="" className="size-4" />
                  <span
                    title={file.name}
                    className="windows95-text flex-1 truncate select-none hover:cursor-pointer"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openPath(file.path.replace(file.name, ""));
                    }}
                    onClick={() => {
                      if (!disabled && !busy && file.path) openFileInPlayer(file.path);
                    }}
                  >
                    {parseTitles ? formatParsedTitle(file.path || file.name, t) : file.name}
                  </span>

                  <span className="windows95-text text-hint">{formatBytes(file.size)}</span>

                  {queueStatus === "queued" && <ListVideo className="text-hint size-3 shrink-0" />}
                  {queueStatus === "processing" && (
                    <SmallLoader size={3} className="text-highlight shrink-0" />
                  )}

                  {!disabled && file.path && <UpscalePlayer filePath={file.path} />}
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled || busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.path) openInAppPlayer(file.path);
                    }}
                    title={t("player.folder.open.iluha.player")}
                    aria-label={t("player.folder.open.iluha.player")}
                  >
                    <Play className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled || busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.path) openFileInPlayer(file.path);
                    }}
                    title={
                      disabled
                        ? t("player.folder.track.disabled")
                        : t("player.folder.open.media.player")
                    }
                  >
                    <Monitor className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnilistSearchQuery(parseMediaPath(file.path || file.name).searchTitle);
                    }}
                    title={t("player.folder.search.anilist")}
                    aria-label={t("player.folder.search.anilist")}
                  >
                    <Search className="size-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default FolderView;
