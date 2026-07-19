import type { AniMedia } from "@/types/anilist";
import {
  formatLabels,
  seasonLabels,
  statusLabels,
} from "@/config/anilist.config";
import { Calendar, Star, Tv, Heart, Eye } from "lucide-react";
import ImageComponent from "@/components/ui/image.component";

function AniListMetadata({
  anime,
  onSeason,
}: {
  anime: AniMedia;
  onSeason?: (season: string, seasonYear: number | null) => void;
}) {
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
          className="w-36 h-54 block"
        />
      </section>

      <section className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap gap-1 items-center">
          {anime.score != null && (
            <span className="flex flex-row gap-1 items-center windows95-text px-1 bg-secondary text-white font-bold">
              <Star className="size-3 fill-white" /> {anime.score}
            </span>
          )}
          <span className="windows95-text">
            {statusLabels[anime.status] ?? anime.status}
          </span>
          {anime.format && (
            <span className="text-[10px] windows95-font px-1 bg-white windows95-border text-text">
              {formatLabels[anime.format] ?? anime.format}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 windows95-text underline">
          <Tv className="size-3" />
          {anime.episodes != null && <span>{anime.episodes} эп.</span>}
          {anime.duration != null && <span>× {anime.duration} мин.</span>}
        </div>

        {anime.season && (
          <div
            className="windows95-text underline cursor-pointer"
            onClick={() => onSeason?.(anime.season!, anime.season_year)}
          >
            {seasonLabels[anime.season] ?? anime.season} {anime.season_year}
          </div>
        )}

        {anime.start_date && (
          <div className="flex flex-wrap gap-1 windows95-text underline">
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
            {anime.next_episode} серия ·{" "}
            {new Date(anime.next_airing_at * 1000).toLocaleDateString("ru-RU")}
          </span>
        )}

        <div className="flex flex-wrap gap-2 items-center mt-1">
          {bestRank && (
            <span className="windows95-text px-1 bg-white windows95-border text-[10px]">
              #{bestRank.rank} {bestRank.context}
            </span>
          )}
          {anime.popularity != null && (
            <span className="flex flex-row gap-0.5 items-center windows95-text text-[10px]">
              <Eye className="size-2.5" /> {anime.popularity.toLocaleString()}
            </span>
          )}
          {anime.favourites != null && (
            <span className="flex flex-row gap-0.5 items-center windows95-text text-[10px]">
              <Heart className="size-2.5" /> {anime.favourites.toLocaleString()}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}

export default AniListMetadata;
