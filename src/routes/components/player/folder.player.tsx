import { useVirtualizer } from "@tanstack/react-virtual";
import { openPath } from "@tauri-apps/plugin-opener";
import { parse } from "anitomy";
import { ChevronDown, ChevronRight, ListVideo, Monitor, EyeOff, Search, X } from "lucide-react";
import { useState, useRef, useMemo, useCallback, type RefObject } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { FOLDER_LIST_MAX_HEIGHT, FOLDER_VIRTUALIZE_AFTER } from "@/config/player/folders.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { flattenTree } from "@/lib/player/tree.utils";
import { fmtSize } from "@/lib/torrent/common.utils";
import { openFileInPlayer } from "@/lib/utils/media.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { FolderNode } from "@/types/index";

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
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);
  const setAnilistSearchQuery = useSearchStore((state) => state.setAnilistSearchQuery);
  const parseTitles = useSettingsStore((state) => state.parseTitles);
  const { t } = useI18n();

  const items = useUpscaleQueueStore((s) => s.items);

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

              return (
                <div
                  key={index}
                  className="windows95-border hover:bg-surface absolute top-0 left-0 flex h-5 w-full items-center gap-1 bg-white px-1 hover:cursor-pointer"
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
                      if (!disabled && file.path) openFileInPlayer(file.path);
                    }}
                  >
                    {parseTitles ? formatParsedTitle(file.name, t) : file.name}
                  </span>

                  <span className="windows95-text text-hint">{fmtSize(file.size)}</span>

                  {(() => {
                    const status = file.path ? queueMap.get(file.path) : undefined;
                    if (!status) return null;
                    if (status === "queued")
                      return <ListVideo className="text-hint size-3 shrink-0" />;
                    if (status === "processing")
                      return <SmallLoader size={3} className="text-highlight shrink-0" />;
                    return null;
                  })()}

                  {!disabled && file.path && <UpscalePlayer filePath={file.path} />}
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      const parsed = parse(file.name);
                      if (parsed) setAnilistSearchQuery(String(parsed.title));
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
