import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ListVideo, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { fileNameFromPath } from "@/lib/search/parse.utils";
import { appendFilesQuiet, readPlaylistEntries } from "@/lib/player/playback.utils";
import type { PlaylistEntry } from "@/types/player/playback";
import { useCell } from "@/lib/core/signal.hook";
import { attempt, attemptAll, withFallback } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { playbackAtoms, subscribePlayback } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { PlaylistBodyProps } from "@/types/player/player";

import { PLAYLIST_VIRTUALIZE_AFTER } from "@/config/player/playlist.config";
import { resolvePlaylistDragMove, entryLabel, playlistCardKey } from "@/lib/player/playlist.utils";
import { PlaylistCard } from "@/routes/components/player/media/playlist/card.playlist";

export default function PlaylistBody({
  onPlay,
  onRemove,
  onMove,
  focusedIndex,
}: PlaylistBodyProps) {
  const { t } = useI18n();

  const path = useCell(playbackAtoms.path);
  const parseTitles = useCell(settingsAtoms.parseTitlesPlayer);
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const entriesRef = useRef<PlaylistEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => playlistCardKey(entries, index),
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
    let previous = playbackAtoms.playlistCount.get();
    return subscribePlayback(() => {
      const current = playbackAtoms.playlistCount.get();
      if (current !== previous) {
        previous = current;
        ignore(refresh());
      }
    });
  }, [refresh]);

  const mutate = useCallback(
    async (action: Promise<unknown>, optimistic?: PlaylistEntry[], refreshAfter = true) => {
      const previous = entriesRef.current;
      if (optimistic) applyEntries(optimistic);
      const [, error] = await attempt(action);
      if (error && optimistic) {
        applyEntries(previous);
        return;
      }
      if (refreshAfter) await refresh();
    },
    [applyEntries, refresh]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const next = entriesRef.current.filter((entry) => entry.index !== index);
      return mutate(onRemove(index), next, false);
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

  const onAdd = async () => {
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
          if (files.length > 0) await mutate(appendFilesQuiet(files), undefined, false);
        },
      ],
      { onFinally: () => setAdding(false) }
    );
  };

  const playingName = path ? fileNameFromPath(path).toLowerCase() : "";
  const matchedIndex = playingName
    ? entries.findIndex(
        (entry) =>
          entry.filename !== "" && fileNameFromPath(entry.filename).toLowerCase() === playingName
      )
    : -1;
  const activeIndex = matchedIndex >= 0 ? entries[matchedIndex].index : (entries[0]?.index ?? -1);
  const virtualized = entries.length > PLAYLIST_VIRTUALIZE_AFTER;
  const focusPosition =
    focusedIndex == null ? -1 : entries.findIndex((entry) => entry.index === focusedIndex);

  useEffect(() => {
    if (focusPosition < 0) return;
    if (virtualized) {
      virtualizer.scrollToIndex(focusPosition, { align: "auto" });
      return;
    }
    const card = scrollRef.current?.querySelector<HTMLElement>('[data-focused="true"]');
    card?.scrollIntoView({ block: "nearest" });
  }, [focusPosition, virtualized, virtualizer]);

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
          data-virtual-list={entries.length > PLAYLIST_VIRTUALIZE_AFTER ? "" : undefined}
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
                  key={playlistCardKey(entries, position)}
                  entry={entry}
                  position={position}
                  current={current}
                  focused={position === focusPosition}
                  label={labels.get(entry.index) ?? `#${entry.index + 1}`}
                  upDisabled={position === 0}
                  downDisabled={position === entries.length - 1}
                  onPlay={onPlay}
                  onRemove={handleRemove}
                  onMove={handleMove}
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
                      focused={virtualItem.index === focusPosition}
                      label={labels.get(entry.index) ?? `#${entry.index + 1}`}
                      upDisabled={virtualItem.index === 0}
                      downDisabled={virtualItem.index === entries.length - 1}
                      onPlay={onPlay}
                      onRemove={handleRemove}
                      onMove={handleMove}
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

export { resolvePlaylistDragMove };
