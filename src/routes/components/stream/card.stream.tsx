import { memo, useState } from "react";

import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { useStreamHistoryProgress } from "@/hooks/stream/catalog.hook";
import { formatResume } from "@/lib/core/history.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { StreamingAnime } from "@/types/player/stream";

/**
 * One catalog tile, shaped like the collection card: poster on top, a dense
 * two-line caption under it. The rating is the site's own average, which
 * arrives in the same list answer as the card itself. There is no AniList
 * badge: a site match is not a state of this title, and the modal already
 * carries the AniList action.
 */
function StreamCardView({
  anime,
  onOpen,
  tabIndex = 0,
  onFocus,
}: {
  anime: StreamingAnime;
  onOpen: () => void;
  /** Roving tabindex: only the active tile is a Tab stop. */
  tabIndex?: number;
  onFocus?: () => void;
}) {
  const { t } = useI18n();
  const cover = useStreamCover(anime.cover);
  // The progress badge is asked for on hover only: a page of sixty tiles must
  // not fire sixty local queries to draw something most of them never show.
  const [hovered, setHovered] = useState(false);
  const progress = useStreamHistoryProgress(anime.id, hovered);
  const watched = progress.data?.watched ?? 0;
  const lastPosition = progress.data?.lastPosition ?? 0;
  let watchLabel: string | null = null;
  if (progress.data) {
    if (watched > 0) watchLabel = `${watched} ${t("stream.history.watched")}`;
    else if (lastPosition > 0) watchLabel = formatResume(lastPosition);
  }
  const meta = [anime.year != null ? String(anime.year) : null, anime.mediaType ?? null].filter(
    Boolean
  );

  return (
    <div className="windows95-active-border bg-field flex w-full flex-col overflow-hidden select-none [contain-intrinsic-size:auto] [content-visibility:auto]">
      <div
        role="button"
        tabIndex={tabIndex}
        data-stream-card
        onFocus={onFocus}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
        {watchLabel && (
          <span
            className="bg-primary text-text windows95-small-border absolute top-1 left-1 px-1 py-0.5 text-xs leading-none font-bold"
            title={progress.data?.title}
          >
            {watchLabel}
          </span>
        )}
        {anime.rating != null && anime.rating > 0 && (
          <span className="bg-secondary text-title-text absolute bottom-1 left-1 px-1 py-0.5 text-xs leading-none font-bold">
            {`${anime.rating.toFixed(1)}/10`}
          </span>
        )}
        {anime.status && (
          <span className="bg-secondary text-title-text windows95-text absolute right-0 bottom-0 px-1 py-0.5 text-xs leading-none font-bold">
            {anime.status}
          </span>
        )}
      </div>

      <div className="bg-primary flex h-10 shrink-0 flex-col justify-center gap-0 px-1 py-1">
        <h3
          className="windows95-text min-w-0 truncate text-xs leading-tight font-bold"
          title={anime.title}
        >
          {anime.title}
        </h3>
        <span className="text-hint windows95-text min-w-0 truncate text-xs leading-tight">
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
    previous.anime.mediaType === next.anime.mediaType &&
    previous.anime.rating === next.anime.rating &&
    previous.tabIndex === next.tabIndex &&
    previous.onFocus === next.onFocus
);

export default StreamCard;
