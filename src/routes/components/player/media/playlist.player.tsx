import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import { ArrowDown, ArrowUp, GripVertical, ListVideo, Play, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { fetchVideoCard, getCachedCard } from "@/lib/player/cardCache.utils";
import type { CardArt } from "@/lib/player/cardCache.utils";
import {
  appendFilesQuiet,
  readPlaylistEntries,
  type PlaylistEntry,
} from "@/lib/player/playback.utils";
import { fileNameFromPath, formatParsedTitle } from "@/lib/player/title.utils";
import { attempt, attemptAll, withFallback } from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { formatVerticalDragTransform } from "@/lib/utils/drag.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { formatClock } from "@/lib/utils/time.utils";
import { useMediaStore } from "@/store/media.store";
import { usePlaybackStore } from "@/store/player.store";
import { useSettingsStore } from "@/store/settings.store";
import type { TFunc } from "@/types/i18n";
import type { PlaylistBodyProps } from "@/types/player";

export function resolvePlaylistDragMove(
  activeId: unknown,
  overId: unknown
): { from: number; to: number } | null {
  const from = typeof activeId === "number" ? activeId : Number(activeId);
  const to = typeof overId === "number" ? overId : Number(overId);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from === to) return null;
  return { from, to };
}

function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const root = element.closest("[data-playlist-scroll]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: root instanceof Element ? root : null, rootMargin: "256px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, visible] as const;
}

function useCardArt(path: string, visible: boolean): CardArt | null {
  const [art, setArt] = useState<CardArt | null>(() => getCachedCard(path));

  useEffect(() => {
    if (!visible || !path || getCachedCard(path)) return;
    let disposed = false;
    fetchVideoCard(path)
      .then((card) => {
        if (!disposed && card) setArt(card);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [path, visible]);

  return art;
}

function CardThumbnail({
  url,
  position,
  current,
  duration,
}: {
  url: string | undefined;
  position: number;
  current: boolean;
  duration: number;
}) {
  return (
    <div className="windows95-border bg-field relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ListVideo className="text-hint size-4" />
      )}
      <span className="windows95-font bg-primary/90 text-text absolute top-0 left-0 px-1 text-xs tabular-nums">
        {position + 1}
      </span>
      {duration > 0 ? (
        <span className="windows95-font absolute right-0 bottom-0 bg-black/70 px-1 text-xs text-white tabular-nums">
          {formatClock(duration)}
        </span>
      ) : null}
      {current ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
          <Play className="size-6 text-white" fill="currentColor" />
        </span>
      ) : null}
    </div>
  );
}

function CurrentProgress() {
  const timePos = usePlaybackStore((state) => state.timePos);
  const duration = usePlaybackStore((state) => state.duration);
  if (duration <= 0) return null;
  const percent = Math.max(0, Math.min(100, (timePos / duration) * 100));
  return (
    <div className="windows95-border bg-field h-1.5 w-full overflow-hidden">
      <div className="bg-highlight h-full" style={{ width: `${percent}%` }} />
    </div>
  );
}

function entryLabel(entry: PlaylistEntry, parseTitles: boolean, t: TFunc): string {
  if (entry.title) return entry.title;
  const name = entry.filename ? fileNameFromPath(entry.filename) : "";
  if (!name) return `#${entry.index + 1}`;
  return parseTitles ? formatParsedTitle(name, t) : name;
}

const PLAYLIST_VIRTUALIZE_AFTER = 50;

function PlaylistBody({ onPlay, onRemove, onMove }: PlaylistBodyProps) {
  const { t } = useI18n();

  const path = usePlaybackStore((state) => state.path);
  const parseTitles = useSettingsStore((state) => state.parseTitles);
  const videoExtensions = useSettingsStore((state) => state.videoExtensions);
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const entriesRef = useRef<PlaylistEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
    enabled: entries.length > PLAYLIST_VIRTUALIZE_AFTER,
  });

  const applyEntries = useCallback((next: PlaylistEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const refresh = useCallback(async () => {
    applyEntries(await readPlaylistEntries());
  }, [applyEntries]);

  const labels = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of entries) map.set(entry.index, entryLabel(entry, parseTitles, t));
    return map;
  }, [entries, parseTitles, t]);

  useEffect(() => {
    ignore(refresh());
    return usePlaybackStore.subscribe((state, previous) => {
      if (state.playlistCount !== previous.playlistCount) ignore(refresh());
    });
  }, [refresh]);

  const mutate = useCallback(
    async (action: Promise<unknown>, optimistic?: PlaylistEntry[]) => {
      const previous = entriesRef.current;
      if (optimistic) applyEntries(optimistic);
      const [, error] = await attempt(action);
      if (error && optimistic) {
        applyEntries(previous);
        return;
      }
      await refresh();
    },
    [applyEntries, refresh]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const next = entriesRef.current.filter((entry) => entry.index !== index);
      return mutate(onRemove(index), next);
    },
    [mutate, onRemove]
  );

  const handleMove = useCallback(
    (from: number, to: number) => {
      const list = entriesRef.current;
      const fromPos = list.findIndex((entry) => entry.index === from);
      const toPos = list.findIndex((entry) => entry.index === to);
      if (fromPos === -1 || toPos === -1) return mutate(onMove(from, to));
      const next = [...list];
      const [moved] = next.splice(fromPos, 1);
      next.splice(toPos, 0, moved);
      return mutate(onMove(from, to), next);
    },
    [mutate, onMove]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const move = resolvePlaylistDragMove(event.active.id, event.over?.id);
      if (!move) return;
      ignore(handleMove(move.from, move.to));
    },
    [handleMove]
  );

  async function onAdd() {
    setAdding(true);
    await attemptAll(
      [
        async () => {
          const selection = await withFallback(
            openDialog({
              multiple: true,
              filters: [{ name: t("player.media.playlist.filter"), extensions: videoExtensions }],
            }),
            null
          );
          const files = selection ? (Array.isArray(selection) ? selection : [selection]) : [];
          if (files.length > 0) await mutate(appendFilesQuiet(files));
        },
      ],
      { onFinally: () => setAdding(false) }
    );
  }

  const playingName = path ? fileNameFromPath(path).toLowerCase() : "";
  const matchedIndex = playingName
    ? entries.findIndex(
        (entry) =>
          entry.filename !== "" && fileNameFromPath(entry.filename).toLowerCase() === playingName
      )
    : -1;
  const activeIndex = matchedIndex >= 0 ? entries[matchedIndex].index : (entries[0]?.index ?? -1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center p-1">
        <Button
          className="w-full"
          disabled={adding}
          title={t("player.media.playlist.add")}
          aria-label={t("player.media.playlist.add")}
          onClick={() => ignore(onAdd())}
        >
          <Plus className="size-3.5" />
          <span className="windows95-font text-xs">{t("player.media.playlist.add")}</span>
        </Button>
      </div>
      {entries.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-1 px-2 py-0.5">
          <span className="windows95-font text-hint text-xs tabular-nums">
            {t("player.media.playlist.count", { count: entries.length })}
          </span>
        </div>
      ) : null}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          ref={scrollRef}
          data-playlist-scroll
          data-no-wheel
          className="min-h-0 flex-1 overflow-y-auto p-1"
        >
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-1 py-4 text-center">
              <ListVideo className="text-hint size-6" aria-hidden="true" />
              <div className="windows95-font text-xs">{t("player.media.playlist.empty")}</div>
            </div>
          ) : entries.length <= PLAYLIST_VIRTUALIZE_AFTER ? (
            entries.map((entry, position) => {
              const current = entry.index === activeIndex;
              return (
                <PlaylistCard
                  key={`${entry.filename}:${entry.index}`}
                  entry={entry}
                  position={position}
                  current={current}
                  label={labels.get(entry.index) ?? `#${entry.index + 1}`}
                  upDisabled={position === 0}
                  downDisabled={position === entries.length - 1}
                  onPlay={onPlay}
                  onRemove={handleRemove}
                  onMove={handleMove}
                  mutate={mutate}
                  t={t}
                />
              );
            })
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const entry = entries[virtualItem.index];
                if (!entry) return null;
                const current = entry.index === activeIndex;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full pb-1"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <PlaylistCard
                      entry={entry}
                      position={virtualItem.index}
                      current={current}
                      label={labels.get(entry.index) ?? `#${entry.index + 1}`}
                      upDisabled={virtualItem.index === 0}
                      downDisabled={virtualItem.index === entries.length - 1}
                      onPlay={onPlay}
                      onRemove={handleRemove}
                      onMove={handleMove}
                      mutate={mutate}
                      t={t}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DndContext>
    </div>
  );
}

function cardMetaText(art: CardArt | null): string {
  const duration = art?.duration ?? 0;
  const size = art?.size ?? 0;
  if (duration > 0 && size > 0) return `${formatClock(duration)} / ${formatBytes(size)}`;
  if (size > 0) return formatBytes(size);
  return "";
}

function cardClass(current: boolean, isOver: boolean): string {
  return cn(
    "windows95-border relative mb-1 flex flex-col gap-1 p-1",
    current ? "windows95-active-border bg-secondary text-primary" : "bg-field hover:bg-surface",
    isOver && "outline-highlight outline-2"
  );
}

function PlaylistCardMeta({ meta, current }: { meta: string; current: boolean }) {
  if (!meta) return null;
  return (
    <span className={cn("text-xs tabular-nums", current ? "text-primary/80" : "text-hint")}>
      {meta}
    </span>
  );
}

function PlaylistCardActions({
  entry,
  upDisabled,
  downDisabled,
  onMove,
  onRemove,
  mutate,
  t,
}: {
  entry: PlaylistEntry;
  upDisabled: boolean;
  downDisabled: boolean;
  onMove: (from: number, to: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  mutate: (action: Promise<unknown>) => Promise<void>;
  t: TFunc;
}) {
  return (
    <>
      <div className="flex shrink-0 flex-col gap-0.5" role="group">
        <Button
          size="icon"
          className="size-5"
          title={t("player.media.playlist.move.up")}
          aria-label={t("player.media.playlist.move.up")}
          disabled={upDisabled}
          onClick={() => ignore(mutate(onMove(entry.index, entry.index - 1)))}
        >
          <ArrowUp className="size-3" />
        </Button>
        <Button
          size="icon"
          className="size-5"
          title={t("player.media.playlist.move.down")}
          aria-label={t("player.media.playlist.move.down")}
          disabled={downDisabled}
          onClick={() => ignore(mutate(onMove(entry.index, entry.index + 1)))}
        >
          <ArrowDown className="size-3" />
        </Button>
      </div>
      <Button
        size="icon"
        className="size-5 shrink-0"
        title={t("player.media.playlist.remove")}
        aria-label={t("player.media.playlist.remove")}
        onClick={() => ignore(mutate(onRemove(entry.index)))}
      >
        <X className="size-3" />
      </Button>
    </>
  );
}

function PlaylistCard({
  entry,
  position,
  current,
  label,
  upDisabled,
  downDisabled,
  onPlay,
  onRemove,
  onMove,
  mutate,
  t,
}: {
  entry: PlaylistEntry;
  position: number;
  current: boolean;
  label: string;
  upDisabled: boolean;
  downDisabled: boolean;
  onPlay: (index: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  onMove: (from: number, to: number) => Promise<void>;
  mutate: (action: Promise<unknown>) => Promise<void>;
  t: TFunc;
}) {
  const [cardRef, onScreen] = useOnScreen<HTMLDivElement>();
  const art = useCardArt(entry.filename, onScreen || current);
  const resumeRatio = useMediaStore((state) => {
    const saved = state.entries.find((item) => item.path === entry.filename);
    if (!saved || saved.duration <= 0 || saved.position <= 0) return 0;
    return Math.max(0, Math.min(1, saved.position / saved.duration));
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: entry.index });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: entry.index });
  const duration = art?.duration ?? 0;
  const meta = cardMetaText(art);

  return (
    <div
      ref={(node) => {
        cardRef.current = node;
        setDragRef(node);
        setDropRef(node);
      }}
      data-testid="playlist-card"
      data-current={current ? "true" : undefined}
      className={cardClass(current, isOver)}
      style={{
        transform: formatVerticalDragTransform(transform),
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.6 : undefined,
      }}
    >
      <div className="flex items-center gap-1">
        <span
          ref={setActivatorNodeRef}
          data-testid="playlist-drag-handle"
          title={t("player.media.playlist.drag")}
          aria-label={t("player.media.playlist.drag")}
          className="text-hint flex shrink-0 cursor-grab touch-none items-center self-stretch px-0.5 select-none active:cursor-grabbing"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          title={t("player.media.playlist.play")}
          aria-current={current ? "true" : undefined}
          onClick={() => ignore(onPlay(entry.index))}
        >
          <CardThumbnail url={art?.url} position={position} current={current} duration={duration} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              title={entry.filename || label}
              className={cn("windows95-font truncate text-xs", current && "font-bold")}
            >
              {label}
            </span>
            <PlaylistCardMeta meta={meta} current={current} />
          </span>
        </button>
        <PlaylistCardActions
          entry={entry}
          upDisabled={upDisabled}
          downDisabled={downDisabled}
          onMove={onMove}
          onRemove={onRemove}
          mutate={mutate}
          t={t}
        />
      </div>
      {current ? <CurrentProgress /> : null}
      {!current && resumeRatio > 0 ? (
        <div className="bg-field h-0.5 w-full overflow-hidden" title={label}>
          <div className="bg-hint h-full" style={{ width: `${resumeRatio * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export default PlaylistBody;
