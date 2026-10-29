import { Info, Play } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import type { StreamingAnime } from "@/types/stream";

/**
 * The title header of the detail modal: poster, identity, synopsis and the one
 * primary action. The AniList button appears only when the source returned an
 * `anilist_id` and there is a session to read the details with; it swaps this
 * modal for the AniList detail instead of leaving the streaming tab.
 */
export default function StreamHero({
  anime,
  episodeNumber,
  canPlay,
  playing,
  canOpenAnilist,
  onPlay,
  onOpenAnilist,
}: {
  anime: StreamingAnime;
  episodeNumber: number | null;
  canPlay: boolean;
  playing: boolean;
  canOpenAnilist: boolean;
  onPlay: () => void;
  onOpenAnilist: () => void;
}) {
  const { t } = useI18n();
  const cover = useStreamCover(anime.cover);
  const meta = [
    anime.year != null ? String(anime.year) : null,
    anime.status,
    anime.subOrDub,
    anime.episodeCount != null && anime.episodeCount > 0
      ? t("stream.episodes.count", { count: anime.episodeCount })
      : null,
  ].filter(Boolean);

  return (
    <section className="flex w-full gap-2">
      <div className="windows95-border bg-field h-44 w-32 shrink-0 overflow-hidden">
        {cover ? (
          <Image
            src={cover}
            alt={anime.title}
            className="h-full w-full"
            type="cover"
            loading="eager"
          />
        ) : (
          <span className="text-hint windows95-text flex h-full items-center justify-center text-xs">
            {t("stream.noCover")}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1">
          <h2 className="windows95-text min-w-0 flex-1 text-sm leading-tight font-bold">
            {anime.title}
          </h2>
          {anime.anilistId && canOpenAnilist ? (
            <Button
              size="icon"
              title={t("stream.anilist.open")}
              aria-label={t("stream.anilist.open")}
              onClick={onOpenAnilist}
            >
              <Info className="size-3" />
            </Button>
          ) : null}
        </div>

        {anime.synonyms.length > 0 ? (
          <span
            className="text-hint windows95-text min-w-0 truncate text-xs"
            title={anime.synonyms.join(", ")}
          >
            {anime.synonyms.join(", ")}
          </span>
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          {meta.map((value) => (
            <span
              key={value}
              className="windows95-small-border bg-secondary text-title-text windows95-text px-1 text-xs leading-tight font-bold"
            >
              {value}
            </span>
          ))}
        </div>

        {anime.genres.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {anime.genres.slice(0, 8).map((genre) => (
              <span
                key={genre}
                className="windows95-small-border bg-field windows95-text px-1 text-xs leading-tight"
              >
                {genre}
              </span>
            ))}
          </div>
        ) : null}

        {anime.description ? (
          <p className="text-text windows95-text max-h-20 overflow-y-auto text-xs break-words whitespace-pre-wrap">
            {anime.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-1">
          <Button onClick={onPlay} disabled={!canPlay} loading={playing}>
            <Play className="size-3" />
            {playing ? t("stream.resolving") : t("stream.play")}
          </Button>
          {episodeNumber != null ? (
            <span className="text-hint windows95-text">
              {t("stream.episode.selected", { n: episodeNumber })}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
