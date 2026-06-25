import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useSearchStore } from "@/store/search.store";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Loader, Search } from "lucide-react";

interface AniRanking {
  rank: number;
  type_: string;
  context: string;
}

interface AniMedia {
  id: number;
  title: string;
  english_title: string | null;
  native_title: string | null;
  synonyms: string[];
  episodes: number | null;
  duration: number | null;
  format: string | null;
  status: string;
  score: number | null;
  genres: string[];
  tags: string[];
  description: string | null;
  cover_url: string | null;
  season: string | null;
  season_year: number | null;
  studios: string[];
  next_episode: number | null;
  next_airing_at: number | null;
  start_date: string | null;
  end_date: string | null;
  popularity: number | null;
  favourites: number | null;
  rankings: AniRanking[];
}

const statusLabels: Record<string, string> = {
  FINISHED: "Завершён",
  RELEASING: "Выходит",
  NOT_YET_RELEASED: "Анонс",
  CANCELLED: "Отменён",
  HIATUS: "На паузе",
};

const formatLabels: Record<string, string> = {
  TV: "ТВ",
  TV_SHORT: "ТВ (короткий)",
  MOVIE: "Фильм",
  SPECIAL: "Спешл",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Клип",
};

const seasonLabels: Record<string, string> = {
  WINTER: "Зима",
  SPRING: "Весна",
  SUMMER: "Лето",
  FALL: "Осень",
};

function AniListDetailModal({
  animeId,
  onClose,
}: {
  animeId: number;
  onClose: () => void;
}) {
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);

  const { data: anime, isLoading } = useQuery({
    queryKey: ["anime_detail", animeId],
    queryFn: () => invoke<AniMedia>("get_anime_by_id", { id: animeId }),
  });

  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };

  return (
    <Modal header={anime?.title ?? "Загрузка..."} onClose={onClose}>
      {isLoading || !anime ? (
        <div className="flex items-center justify-center flex-1">
          <Loader className="size-6 animate-spin windows95-text" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto min-h-0 flex-1 pb-1 p-2">
          {/* Cover + Metadata row */}
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
                    {seasonLabels[anime.season] ?? anime.season}{" "}
                    {anime.season_year}
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
              {anime.english_title && (
                <button
                  onClick={() => handleSearchTorrents(anime.english_title!)}
                  className="text-left text-[11px] font-bold windows95-text underline decoration-dotted hover:bg-primary px-0.5 -mx-0.5 cursor-pointer truncate"
                  title="Искать торренты по этому названию"
                >
                  ◈ {anime.english_title}
                </button>
              )}
              {anime.native_title && (
                <button
                  onClick={() => handleSearchTorrents(anime.native_title!)}
                  className="text-left text-[11px] windows95-text underline decoration-dotted hover:bg-primary px-0.5 -mx-0.5 cursor-pointer truncate"
                  title="Искать торренты по этому названию"
                >
                  ◈ {anime.native_title}
                </button>
              )}
              {anime.next_episode && anime.next_airing_at && (
                <span className="text-[11px] text-success font-bold">
                  {anime.next_episode} серия ·{" "}
                  {new Date(anime.next_airing_at * 1000).toLocaleDateString(
                    "ru-RU",
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Studios */}
          {anime.studios.length > 0 && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Студии
              </div>
              <div className="flex flex-wrap gap-1 p-1">
                {anime.studios.map((s) => (
                  <span
                    key={s}
                    className="px-1 text-[10px] windows95-font bg-primary windows95-border text-text"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {anime.description && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Описание
              </div>
              <div className="text-[11px] windows95-text leading-relaxed max-h-48 overflow-y-auto p-1 whitespace-pre-line">
                {anime.description}
              </div>
            </div>
          )}

          {/* Genres + Tags */}
          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Жанры и теги
              </div>
              <div className="flex flex-wrap gap-1 p-1">
                {anime.genres.map((g) => (
                  <span
                    key={g}
                    className="px-1 text-[10px] windows95-font bg-secondary text-white font-bold"
                  >
                    {g}
                  </span>
                ))}
                {anime.tags.slice(0, 15).map((t) => (
                  <span
                    key={t}
                    className="px-1 text-[9px] windows95-font bg-primary windows95-border text-text"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Synonyms */}
          {anime.synonyms.length > 0 && (
            <div className="windows95-border">
              <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
                Другие названия
              </div>
              <div className="flex flex-col gap-0.5 p-1">
                {anime.synonyms.map((syn) => (
                  <button
                    key={syn}
                    onClick={() => handleSearchTorrents(syn)}
                    className="text-left text-[10px] windows95-text underline decoration-dotted hover:bg-primary px-0.5 -mx-0.5 cursor-pointer truncate"
                    title="Искать торренты по этому названию"
                  >
                    ◉ {syn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="windows95-border">
            <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
              Статистика
            </div>
            <div className="flex flex-col gap-0.5 p-1">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] windows95-text">
                {anime.popularity && (
                  <span>
                    Популярность: #{anime.popularity.toLocaleString("ru-RU")}
                  </span>
                )}
                {anime.favourites && (
                  <span>
                    В избранном: {anime.favourites.toLocaleString("ru-RU")}
                  </span>
                )}
              </div>
              {anime.rankings.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] windows95-text">
                  {anime.rankings.map((r, i) => (
                    <span key={i}>
                      {r.type_ === "RATED" ? "★" : "▸"} #{r.rank} в {r.context}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <Button
            onClick={() => handleSearchTorrents()}
            className="self-end mt-1"
          >
            <Search className="size-3" />
            Искать торренты
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default AniListDetailModal;
