import { memo } from "react";

import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { StreamingAnime } from "@/types/stream";

/**
 * One catalog tile. The shape follows the collection card: a poster filling the
 * top of the tile, then a dense caption bar with the title and one metadata
 * line. Streaming has no collection status, so there is no status strip.
 */
function StreamCardView({ anime, onOpen }: { anime: StreamingAnime; onOpen: () => void }) {
  const { t } = useI18n();
  const cover = useStreamCover(anime.cover);
  const meta = [
    anime.year != null ? String(anime.year) : null,
    anime.episodeCount != null && anime.episodeCount > 0
      ? t("stream.episodes.count", { count: anime.episodeCount })
      : null,
  ].filter(Boolean);

  return (
    <div className="windows95-active-border bg-field flex w-full flex-col overflow-hidden select-none">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={enterOrSpace(onOpen)}
        aria-label={anime.title}
        title={anime.title}
        className="bg-field relative aspect-3/4 w-full shrink-0 overflow-hidden hover:cursor-pointer hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted active:brightness-90"
      >
        {cover ? (
          <Image
            src={cover}
            alt={anime.title}
            className="bg-field h-full w-full"
            type="cover"
            loading="lazy"
          />
        ) : (
          <div className="text-hint bg-field windows95-text flex h-full w-full items-center justify-center text-center">
            {t("stream.noCover")}
          </div>
        )}
        {anime.anilistId ? (
          <span className="bg-secondary text-title-text windows95-small-border windows95-text absolute top-1 right-1 px-1 text-xs leading-tight font-bold">
            {t("stream.anilistMatch")}
          </span>
        ) : null}
        {anime.status ? (
          <span className="bg-secondary text-title-text windows95-text absolute bottom-0 left-0 px-1 py-0.5 text-xs leading-none font-bold">
            {anime.status}
          </span>
        ) : null}
      </div>

      <div className="bg-primary flex h-9 shrink-0 flex-col justify-center px-1">
        <h3
          className="windows95-text min-w-0 truncate text-xs leading-tight font-bold"
          title={anime.title}
        >
          {anime.title}
        </h3>
        <span className="text-hint windows95-text truncate text-xs leading-tight">
          {meta.join(", ")}
        </span>
      </div>
    </div>
  );
}

export const StreamCard = memo(
  StreamCardView,
  (previous, next) =>
    previous.anime.id === next.anime.id &&
    previous.anime.title === next.anime.title &&
    previous.anime.cover === next.anime.cover &&
    previous.anime.year === next.anime.year &&
    previous.anime.status === next.anime.status &&
    previous.anime.episodeCount === next.anime.episodeCount &&
    previous.anime.anilistId === next.anime.anilistId
);

export default StreamCard;
