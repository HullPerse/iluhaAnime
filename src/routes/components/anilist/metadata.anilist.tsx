import type { AniMedia } from "@/types/anilist";
import { formatLabels, seasonLabels, statusLabels } from "@/lib/anilist.utils";

function AniListMetadata({ anime }: { anime: AniMedia }) {
  return (
    <div className="flex flex-row gap-3">
      {anime.cover_url && (
        <img
          src={anime.cover_url}
          alt={anime.title}
          className="w-36 shrink-0 windows95-active-border self-start"
        />
      )}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap gap-1 items-center">
          {anime.score && (
            <span className="text-[11px] windows95-font px-1 bg-secondary text-white font-bold">
              ★ {anime.score}
            </span>
          )}
          <span className="text-[11px] windows95-font windows95-text">
            {statusLabels[anime.status] ?? anime.status}
          </span>
          {anime.format && (
            <span className="text-[10px] windows95-font px-1 bg-primary windows95-border text-text">
              {formatLabels[anime.format] ?? anime.format}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] windows95-text">
          {anime.episodes && <span>{anime.episodes} эп.</span>}
          {anime.duration && <span>по {anime.duration} мин.</span>}
          {anime.season && (
            <span>
              {seasonLabels[anime.season] ?? anime.season} {anime.season_year}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
          {anime.start_date && (
            <span className="windows95-text">с {anime.start_date}</span>
          )}
          {anime.end_date && anime.status === "FINISHED" && (
            <span className="windows95-text">по {anime.end_date}</span>
          )}
        </div>
        {anime.next_episode && anime.next_airing_at && (
          <span className="text-[11px] text-success font-bold">
            {anime.next_episode} серия ·{" "}
            {new Date(anime.next_airing_at * 1000).toLocaleDateString("ru-RU")}
          </span>
        )}
      </div>
    </div>
  );
}

export default AniListMetadata;
