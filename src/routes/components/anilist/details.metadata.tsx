import { Calendar, Star, Tv, Heart, Eye } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import {
  formatLabels,
  seasonLabels,
  statusLabels,
} from "@/config/anilist.config";
import { useI18n } from "@/lib/i18n";
import type { AniMedia } from "@/types/anilist";

function AniListMetadata({
  anime,
  onSeason,
}: {
  anime: AniMedia;
  onSeason?: (season: string, seasonYear: number | null) => void;
}) {
  const { t, locale } = useI18n();
  const bestRank =
    anime.rankings.length > 0
      ? anime.rankings.reduce((a, b) => (a.rank < b.rank ? a : b))
      : null;

  return (
    <main className="flex flex-row gap-3">
      <section className="windows95-border shrink-0 self-start bg-white">
        <ImageComponent
          src={anime.cover_url ? anime.cover_url : "/images/unknown_source.png"}
          alt={anime.title}
          className="block h-54 w-36"
        />
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {anime.score != null && (
            <span className="windows95-text bg-secondary flex flex-row items-center gap-1 px-1 font-bold text-white">
              <Star className="size-3 fill-white" /> {anime.score}
            </span>
          )}
          <span className="windows95-text">
            {t((statusLabels[anime.status] ?? anime.status) as never)}
          </span>
          {anime.format && (
            <span className="windows95-font windows95-border text-text bg-white px-1 text-xs">
              {t((formatLabels[anime.format] ?? anime.format) as never)}
            </span>
          )}
        </div>

        <div className="windows95-text flex flex-wrap gap-1 underline">
          <Tv className="size-3" />
          {anime.episodes != null && (
            <span>
              {anime.episodes} {t("anilist.details.epsShort")}
            </span>
          )}
          {anime.duration != null && (
            <span>
              × {t("anilist.metadata.minutes", { count: anime.duration })}
            </span>
          )}
        </div>

        {anime.season && (
          <div
            className="windows95-text cursor-pointer underline"
            onClick={() => onSeason?.(anime.season!, anime.season_year)}
          >
            {t((seasonLabels[anime.season] ?? anime.season) as never)}{" "}
            {anime.season_year}
          </div>
        )}

        {anime.start_date && (
          <div className="windows95-text flex flex-wrap gap-1 underline">
            <Calendar className="size-3" />
            <span>
              {anime.start_date}
              {anime.end_date && anime.status === "FINISHED"
                ? ` - ${anime.end_date}`
                : null}
            </span>
          </div>
        )}

        {anime.next_episode != null && anime.next_airing_at != null && (
          <span className="windows95-text text-success font-bold">
            {t("anilist.metadata.nextEpisode", { n: anime.next_episode })} -{" "}
            {new Date(anime.next_airing_at * 1000).toLocaleDateString(locale)}
          </span>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {bestRank && (
            <span className="windows95-text windows95-border bg-white px-1 text-xs">
              #{bestRank.rank} {bestRank.context}
            </span>
          )}
          {anime.popularity != null && (
            <span className="windows95-text flex flex-row items-center gap-0.5 text-xs">
              <Eye className="size-2.5" /> {anime.popularity.toLocaleString()}
            </span>
          )}
          {anime.favourites != null && (
            <span className="windows95-text flex flex-row items-center gap-0.5 text-xs">
              <Heart className="size-2.5" /> {anime.favourites.toLocaleString()}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}

export default AniListMetadata;
