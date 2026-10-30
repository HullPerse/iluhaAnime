import Section from "@/components/shared/section.component";
import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import type { StreamingAnime } from "@/types/player/stream";

/**
 * The title header of the detail modal: poster, identity, badges, genres and
 * synopsis. It carries no action: playback is the episode rows, and the
 * AniList and copy-link buttons sit in the modal header beside the close
 * button, where every dialog in the app keeps its window actions.
 */
export default function StreamHero({ anime }: { anime: StreamingAnime }) {
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
        <h2 className="windows95-text min-w-0 text-sm leading-tight font-bold">{anime.title}</h2>

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

        {anime.description && (
          <Section
            header={t("anilist.details.description")}
            className="windows95-text bg-field overflow-y-auto leading-relaxed whitespace-pre-line"
          >
            <textarea
              readOnly
              value={anime.description}
              className="text-text windows95-text bg-field h-36 max-h-64 w-full overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap"
            />
          </Section>
        )}
      </div>
    </section>
  );
}
