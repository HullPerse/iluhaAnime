import type { AniMedia } from "@/types/anilist";
import { formatLabels, seasonLabels, statusLabels } from "@/lib/anilist.utils";
import { Calendar, Star, Tv } from "lucide-react";

function AniListMetadata({ anime }: { anime: AniMedia }) {
  return (
    <main className="flex flex-row gap-3">
      <section className="windows95-border shrink-0 self-start  bg-white">
        {anime.cover_url ? (
          <img src={anime.cover_url} alt={anime.title} className="w-36 block" />
        ) : (
          <div className="w-36 h-52 bg-muted/20 flex items-center justify-center">
            <span className="windows95-text text-[10px] text-muted">
              Нет обложки
            </span>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap gap-1 items-center">
          {anime.score && (
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
          {anime.episodes && <span>{anime.episodes} эп.</span>}
          {anime.duration && <span>по {anime.duration} мин.</span>}
          {anime.season && (
            <span>
              {seasonLabels[anime.season] ?? anime.season} {anime.season_year}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 windows95-text underline">
          <Calendar className="size-3" />
          {anime.start_date && (
            <span className="windows95-text">с {anime.start_date}</span>
          )}
          {anime.end_date && anime.status === "FINISHED" && (
            <span className="windows95-text">по {anime.end_date}</span>
          )}
        </div>
        {anime.next_episode && anime.next_airing_at && (
          <span className="windows95-text text-success font-bold">
            {anime.next_episode} серия ·{" "}
            {new Date(anime.next_airing_at * 1000).toLocaleDateString("ru-RU")}
          </span>
        )}
      </section>
    </main>
  );
}

export default AniListMetadata;
