import { useVirtualizer } from "@tanstack/react-virtual";
import { ListVideo } from "lucide-react";
import { useRef } from "react";

import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { StreamingEpisode } from "@/types/stream";

const VIRTUALIZE_AFTER = 40;

/**
 * One row of the season a stream session belongs to.
 *
 * The episode's own cover exists only on some titles, so the row falls back to
 * the title's cover from the session: a season list without art is harder to
 * scan than one with repeated art, and an empty box is worse than both.
 */
function EpisodeRow({
  episode,
  current,
  cover,
  fallbackCover,
  onPick,
}: {
  episode: StreamingEpisode;
  current: boolean;
  /** The best art for this episode: its own cover or an AniList preview. */
  cover: string | null;
  /** The title's cover, fetched only when the episode art is missing. */
  fallbackCover: string | null;
  onPick: (episode: StreamingEpisode) => void;
}) {
  const { t } = useI18n();
  const art = useStreamCover(cover);
  const fallback = useStreamCover(art ? null : fallbackCover);
  const image = art ?? fallback;
  const label = episode.title
    ? `${episode.number}. ${episode.title}`
    : t("player.stream.episodes.number", { n: episode.number });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={current ? "true" : undefined}
      onClick={() => onPick(episode)}
      onKeyDown={enterOrSpace(() => onPick(episode))}
      title={label}
      className={`windows95-border mb-1 flex cursor-pointer items-center gap-1 p-1 select-none ${
        current ? "windows95-active-border bg-secondary text-primary" : "bg-field hover:bg-surface"
      }`}
    >
      <div className="windows95-border bg-field relative flex h-10 w-18 shrink-0 items-center justify-center overflow-hidden">
        {image ? (
          <Image src={image} alt={label} className="h-full w-full" type="cover" loading="lazy" />
        ) : (
          <ListVideo className="text-hint size-3" aria-hidden />
        )}
      </div>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`windows95-font truncate text-xs ${current ? "font-bold" : ""}`}>
          {label}
        </span>
        <span className="text-hint text-xs tabular-nums">
          {episode.duration ? t("player.stream.episodes.duration", { n: episode.duration }) : ""}
        </span>
      </span>
    </div>
  );
}

/**
 * The season of a stream session, in the player's side panel.
 *
 * A stream has no mpv playlist: its "playlist" is the title's episodes, and
 * picking one resolves its sources the same way Next does. Only the current
 * episode is marked; the list itself is not reordered, because the episode
 * order belongs to the site.
 */
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {episodes.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-1 px-2 py-0.5">
          <span className="windows95-font text-hint text-xs tabular-nums">
            {t("player.stream.episodes.count", { count: episodes.length })}
          </span>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        data-playlist-scroll
        data-no-wheel
        className="min-h-0 flex-1 overflow-y-auto p-1"
      >
        {loading && episodes.length === 0 ? (
          <span className="text-hint windows95-font block p-2 text-center text-xs">
            {t("player.stream.episodes.loading")}
          </span>
        ) : episodes.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-1 py-4 text-center">
            <ListVideo className="text-hint size-6" aria-hidden="true" />
            <div className="windows95-font text-xs">{t("player.stream.episodes.empty")}</div>
          </div>
        ) : virtualized ? (
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
        ) : (
          episodes.map((episode) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              current={episode.id === currentId}
              cover={episode.cover ?? previews.get(episode.number) ?? null}
              fallbackCover={fallbackCover}
              onPick={onPick}
            />
          ))
        )}
      </div>
    </div>
  );
}
