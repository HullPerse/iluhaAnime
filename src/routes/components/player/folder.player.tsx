import { Button } from "@/components/ui/button.component";
import { fmtSize } from "@/lib/torrent.utils";
import { openFileInPlayer } from "@/lib/media.utils";
import type { FolderNode } from "@/types/index";
import { useSettingsStore } from "@/store/settings.store";
import { ChevronDown, ChevronRight, Monitor, X } from "lucide-react";
import ImageComponent from "@/components/ui/image.component";
import { useState, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import UpscalePlayer from "./upscale.player";
import { parse } from "anitomy";
import { useSearchStore } from "@/store/search.store";
import { flattenTree } from "@/lib/index.utils";

function FolderView({
  node,
  depth,
  searchQuery,
  onRemove,
  onGenerate,
  isGenerating,
  disabledExtensions,
}: {
  node: FolderNode;
  depth: number;
  searchQuery: string;
  onRemove?: (path: string) => void;
  onGenerate?: (path: string, name: string) => void;
  isGenerating?: boolean;
  disabledExtensions?: Set<string>;
}) {
  const showTrackFiles = useSettingsStore((s) => s.showTrackFiles);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const subtitleExtensions = useSettingsStore((s) => s.subtitleExtensions);
  const setAnilistSearchQuery = useSearchStore(
    (state) => state.setAnilistSearchQuery,
  );

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
    () =>
      flattenTree(
        node,
        open,
        searchQuery,
        disabledExtensions,
        depth,
        trackExts,
      ),
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

  if (flatItems.length === 0) return null;

  return (
    <main className="flex flex-col w-full">
      <div
        role="button"
        className={`flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left`}
        onClick={() => toggle(node.path)}
        style={{
          paddingLeft: `${depth * 12 + 2}px`,
        }}
      >
        {open.has(node.path) ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <ImageComponent
          src="/icons/w2k_folder_closed.ico"
          alt=""
          className="size-4 shrink-0"
        />
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
                <ImageComponent
                  src="/icons/w2k_bitmap_image.ico"
                  alt=""
                  className="size-4"
                />
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
                    <ImageComponent
                      src="/icons/w2k_folder_closed.ico"
                      alt=""
                      className="size-4 shrink-0"
                    />
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
                  className="flex items-center gap-1 px-1 windows95-border h-5 bg-white absolute top-0 left-0 w-full hover:bg-surface hover:cursor-pointer"
                  style={{
                    transform: `translateY(${vItem.start}px)`,
                    paddingLeft: `${item.depth * 12 + 2}px`,
                  }}
                  onClick={() => {
                    const parsed = parse(file.name);
                    if (!parsed) return;
                    setAnilistSearchQuery(String(parsed.title));
                  }}
                >
                  <ImageComponent
                    src="/icons/w2k_wmp_11.ico"
                    alt=""
                    className="size-4"
                  />
                  <span
                    title={file.name}
                    className="windows95-text truncate flex-1 select-none"
                  >
                    {file.name}
                  </span>

                  <span className="windows95-text text-muted">
                    {fmtSize(file.size)}
                  </span>

                  {!disabled && file.path && (
                    <UpscalePlayer filePath={file.path} />
                  )}
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled}
                    onClick={async (e) => {
                      e.stopPropagation();

                      if (!file.path) return;
                      else openFileInPlayer(file.path);
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
