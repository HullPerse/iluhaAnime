import { useVirtualizer } from "@tanstack/react-virtual";
import { ListVideo } from "lucide-react";
import { useRef } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import type { StreamingEpisode } from "@/types/player/stream";

import EpisodeRow from "@/routes/components/player/media/episodeRow.player";

const VIRTUALIZE_AFTER = 40;

export default function StreamEpisodeList({
  episodes,
  currentId,
  previews,
  fallbackCover,
  loading,
  onPick,
}: {
  episodes: StreamingEpisode[];
  currentId: string | null;
  /** AniList preview art keyed by episode number, when the title has one. */
  previews: ReadonlyMap<number, string>;
  /** The title's cover, used when neither the episode nor AniList has art. */
  fallbackCover: string | null;
  loading: boolean;
  onPick: (episode: StreamingEpisode) => void;
}) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: episodes.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => episodes[index]?.id ?? index,
    estimateSize: () => 48,
    overscan: 8,
    enabled: episodes.length > VIRTUALIZE_AFTER,
  });
  const virtualized = episodes.length > VIRTUALIZE_AFTER;
  const loadingEmpty = loading && episodes.length === 0;
  const empty = !loadingEmpty && episodes.length === 0;
  const virtualizedList = !loadingEmpty && !empty && virtualized;
  const flatList = !loadingEmpty && !empty && !virtualized;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {episodes.length > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-1 px-2 py-0.5">
          <span className="windows95-font text-hint text-xs tabular-nums">
            {t("player.stream.episodes.count", { count: episodes.length })}
          </span>
        </div>
      )}
      <div
        ref={scrollRef}
        data-playlist-scroll
        data-no-wheel
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {loadingEmpty && (
          <span className="text-hint windows95-font block p-2 text-center text-xs">
            {t("player.stream.episodes.loading")}
          </span>
        )}
        {empty && (
          <div className="flex flex-col items-center gap-1 px-1 py-4 text-center">
            <ListVideo className="text-hint size-6" aria-hidden="true" />
            <div className="windows95-font text-xs">{t("player.stream.episodes.empty")}</div>
          </div>
        )}
        {virtualizedList && (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const episode = episodes[item.index];
              if (!episode) return null;
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <EpisodeRow
                    episode={episode}
                    current={episode.id === currentId}
                    cover={episode.cover ?? previews.get(episode.number) ?? null}
                    fallbackCover={fallbackCover}
                    onPick={onPick}
                  />
                </div>
              );
            })}
          </div>
        )}
        {flatList &&
          episodes.map((episode) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              current={episode.id === currentId}
              cover={episode.cover ?? previews.get(episode.number) ?? null}
              fallbackCover={fallbackCover}
              onPick={onPick}
            />
          ))}
      </div>
    </div>
  );
}
