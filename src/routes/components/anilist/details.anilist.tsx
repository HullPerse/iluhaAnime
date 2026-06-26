import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { Loader, Search } from "lucide-react";
import { useSearchStore } from "@/store/search.store";
import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import AniListActionControls from "./controls.anilist";
import AniListMetadata from "./metadata.anilist";
import type { AniMedia } from "@/types/anilist";

function AniListDetailModal({
  animeId,
  listEntry,
  isLoggedIn,
  onClose,
  onSaved,
}: {
  animeId: number;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
  isLoggedIn: boolean;
  onClose: () => void;
  onSaved?: () => void;
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
        <div className="flex flex-col gap-2 overflow-y-auto min-h-0 flex-1 pb-1">
          <AniListMetadata anime={anime} />

          {anime.studios.length > 0 && (
            <Section header="Студии" className="flex flex-wrap gap-1">
              {anime.studios.map((s) => (
                <span
                  key={s}
                  className="px-1 text-[10px] windows95-font bg-primary windows95-border text-text"
                >
                  {s}
                </span>
              ))}
            </Section>
          )}

          {anime.description && (
            <Section
              header="Описание"
              className="windows95-text leading-relaxed max-h-36 overflow-y-auto whitespace-pre-line"
            >
              {anime.description}
            </Section>
          )}

          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <Section header="Жанры и теги" className="flex flex-wrap gap-1">
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
            </Section>
          )}

          {anime.titles.length > 0 && (
            <Section header="Все названия" className="flex flex-col gap-0.5">
              {anime.titles.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSearchTorrents(t)}
                  className="text-left text-[10px] windows95-text underline decoration-dotted hover:bg-primary px-0.5 -mx-0.5 cursor-pointer truncate"
                  title="Искать торренты по этому названию"
                >
                  ◉ {t}
                </button>
              ))}
            </Section>
          )}

          <Section header="Статистика" className="flex flex-col gap-0.5">
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
          </Section>

          {isLoggedIn && (
            <AniListActionControls
              anime={anime}
              listEntry={listEntry}
              onSaved={onSaved}
              onClose={onClose}
            />
          )}

          <div className="flex flex-row justify-end gap-2 mt-1">
            <Button variant="default" onClick={() => handleSearchTorrents()}>
              <Search className="size-3" />
              Искать торренты
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default AniListDetailModal;
