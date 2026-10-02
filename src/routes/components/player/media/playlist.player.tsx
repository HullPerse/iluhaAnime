import { cn } from "cn";
import { ArrowDown, ArrowUp, ListVideo, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import {
  readPlaylistEntries,
  readVideoCard,
  type PlaylistEntry,
} from "@/lib/player/playback.utils";
import { fileNameFromPath, formatParsedTitle } from "@/lib/player/title.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { formatClock } from "@/lib/utils/time.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { usePlaybackStore } from "@/store/player.store";
import { useSettingsStore } from "@/store/settings.store";
import type { TFunc } from "@/types/i18n";

type CardArt = { url: string; duration: number; size: number };

const cardCache = new Map<string, CardArt>();

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
      { root: root instanceof Element ? root : null, rootMargin: "256px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, visible] as const;
}

function useCardArt(path: string, visible: boolean): CardArt | null {
  const [art, setArt] = useState<CardArt | null>(() => cardCache.get(path) ?? null);

  useEffect(() => {
    if (!visible || !path || cardCache.has(path)) return;
    let disposed = false;
    readVideoCard(path)
      .then((card) => {
        const next: CardArt = {
          url: assetUrl(card.path),
          duration: card.duration,
          size: card.size,
        };
        cardCache.set(path, next);
        if (!disposed) setArt(next);
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
  index,
  current,
  duration,
}: {
  url: string | undefined;
  index: number;
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
        {index + 1}
      </span>
      {duration > 0 ? (
        <span className="windows95-font absolute right-0 bottom-0 bg-black/70 px-1 text-xs tabular-nums text-white">
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

function PlaylistPanel({
  onPlay,
  onRemove,
  onMove,
}: {
  onPlay: (index: number) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
  onMove: (from: number, to: number) => Promise<void>;
}) {
  const { t } = useI18n();

  const path = usePlaybackStore((state) => state.path);
  const parseTitles = useSettingsStore((state) => state.parseTitles);
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);

  const refresh = useCallback(async () => {
    setEntries(await readPlaylistEntries());
  }, []);

  useEffect(() => {
    ignore(refresh());
    return usePlaybackStore.subscribe((state, previous) => {
      if (state.playlistCount !== previous.playlistCount) ignore(refresh());
    });
  }, [refresh]);

  const mutate = useCallback(
    async (action: Promise<unknown>) => {
      await action.catch(() => undefined);
      await refresh();
    },
    [refresh],
  );

  const playingName = path ? fileNameFromPath(path).toLowerCase() : "";
  const matchedIndex = playingName
    ? entries.findIndex(
        (entry) =>
          entry.filename !== "" &&
          fileNameFromPath(entry.filename).toLowerCase() === playingName,
      )
    : -1;
  const activeIndex = matchedIndex >= 0 ? entries[matchedIndex].index : (entries[0]?.index ?? -1);

  return (
    <aside className="windows95-border flex w-80 shrink-0 flex-col bg-primary">
      <div className="windows95-text border-b-2 border-muted px-2 py-1 text-xs font-bold">
        {t("player.media.playlist.title")}
      </div>
      <div data-playlist-scroll className="min-h-0 flex-1 overflow-y-auto p-1">
        {entries.length === 0 ? (
          <div className="windows95-font px-1 py-2 text-xs">
            {t("player.media.playlist.empty")}
          </div>
        ) : (
          entries.map((entry) => {
            const current = entry.index === activeIndex;
            return (
              <PlaylistCard
                key={entry.index}
                entry={entry}
                current={current}
                label={entryLabel(entry, parseTitles, t)}
                upDisabled={entry.index === 0}
                downDisabled={entry.index === entries.length - 1}
                onPlay={onPlay}
                onRemove={onRemove}
                onMove={onMove}
                mutate={mutate}
                t={t}
              />
            );
          })
        )}
      </div>
    </aside>
  );
}

function PlaylistCard({
  entry,
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

  return (
    <div
      ref={cardRef}
      className={cn(
        "windows95-border mb-1 flex flex-col gap-1 p-1",
        current
          ? "windows95-active-border bg-secondary text-primary"
          : "bg-field hover:bg-surface",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          title={t("player.media.playlist.play")}
          onClick={() => ignore(onPlay(entry.index))}
        >
          <CardThumbnail
            url={art?.url}
            index={entry.index}
            current={current}
            duration={art?.duration ?? 0}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn("windows95-font truncate text-xs", current && "font-bold")}
            >
              {label}
            </span>
            {art && art.size > 0 ? (
              <span className={cn("text-xs", current ? "text-primary/80" : "text-hint")}>
                {formatBytes(art.size)}
              </span>
            ) : null}
          </span>
        </button>
        <div className="flex shrink-0 flex-col gap-0.5">
          <Button
            size="icon"
            className="size-4"
            title={t("player.media.playlist.move.up")}
            aria-label={t("player.media.playlist.move.up")}
            disabled={upDisabled}
            onClick={() => ignore(mutate(onMove(entry.index, entry.index - 1)))}
          >
            <ArrowUp className="size-2.5" />
          </Button>
          <Button
            size="icon"
            className="size-4"
            title={t("player.media.playlist.move.down")}
            aria-label={t("player.media.playlist.move.down")}
            disabled={downDisabled}
            onClick={() => ignore(mutate(onMove(entry.index, entry.index + 1)))}
          >
            <ArrowDown className="size-2.5" />
          </Button>
        </div>
        <Button
          size="icon"
          className="size-4 shrink-0"
          title={t("player.media.playlist.remove")}
          aria-label={t("player.media.playlist.remove")}
          onClick={() => ignore(mutate(onRemove(entry.index)))}
        >
          <X className="size-2.5" />
        </Button>
      </div>
      {current ? <CurrentProgress /> : null}
    </div>
  );
}

export default PlaylistPanel;
