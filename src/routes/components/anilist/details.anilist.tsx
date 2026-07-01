import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  CircleSmall,
  Heart,
  Loader,
  Tag,
  Users,
} from "lucide-react";
import { useSearchStore } from "@/store/search.store";
import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import AniListActionControls from "./controls.anilist";
import AniListMetadata from "./metadata.anilist";
import AniListCharactersPanel from "./characters.anilist";
import type { AniMedia } from "@/types/anilist";
import { useState } from "react";

const RELATION_LABELS: Record<string, string> = {
  SEQUEL: "Сиквел",
  PREQUEL: "Приквел",
  ADAPTATION: "Адаптация",
  SIDE_STORY: "Сайд-стори",
  CHARACTER: "Персонаж",
  SUMMARY: "Сводка",
  ALTERNATIVE: "Альтернатива",
  SPIN_OFF: "Спин-офф",
  PARENT: "Родительская",
  CONTAINS: "Содержит",
  SOURCE: "Источник",
  OTHER: "Другое",
};

function AniListDetailModal({
  animeId,
  listEntry,
  isLoggedIn,
  onTag,
  onGenre,
  onStudio,
  onRelated,
  onClose,
  onSaved,
  favouriteIds,
  onFavouriteToggle,
}: {
  animeId: number;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
  isLoggedIn: boolean;
  favouriteIds?: Set<number>;
  onFavouriteToggle?: (animeId: number) => void;
  onTag: (e: string) => void;
  onGenre: (e: string) => void;
  onStudio?: (id: number, name: string) => void;
  onRelated?: (id: number) => void;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);

  const [showDesc, setShowDesc] = useState<boolean>(false);

  const isFavourited = favouriteIds?.has(animeId) ?? false;

  const handleToggleFav = () => {
    onFavouriteToggle?.(animeId);
  };

  const { data: anime, isLoading } = useQuery({
    queryKey: ["anime_detail", animeId],
    queryFn: () => invoke<AniMedia>("get_anime_by_id", { id: animeId }),
  });

  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };

  return (
    <Modal
      header={anime?.title ?? "Загрузка..."}
      onClose={onClose}
      className="min-w-2xl"
    >
      {isLoading || !anime ? (
        <div className="flex items-center justify-center flex-1">
          <Loader className="size-6 animate-spin windows95-text" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-row gap-2 items-start">
            <div className="flex-1">
              <AniListMetadata anime={anime} />
            </div>
            {isLoggedIn && (
              <button
                onClick={handleToggleFav}
                className="shrink-0 p-1 windows95-border bg-white hover:bg-surface cursor-pointer"
                title={
                  isFavourited ? "Убрать из избранного" : "Добавить в избранное"
                }
              >
                <Heart
                  className={`size-4 ${isFavourited ? "fill-red-500 text-red-500" : "text-text"}`}
                />
              </button>
            )}
          </div>

          {anime.studios.length > 0 && (
            <Section header="Студии" className="flex flex-wrap gap-1 bg-white">
              {anime.studios.map((s, i) => (
                <Button
                  key={i}
                  onClick={() => {
                    onStudio?.(s.id, s.name);
                    onClose();
                  }}
                  className="flex flex-row gap-1 px-1 bg-primary windows95-text underline decoration-dotted"
                  variant="ghost"
                  title="Искать аниме этой студии"
                >
                  <Users className="size-3" /> {s.name}
                </Button>
              ))}
            </Section>
          )}

          <AniListCharactersPanel animeId={anime.id} />

          {anime.relations.length > 0 && (
            <Section
              header="Связанное"
              className="flex flex-col bg-white"
              expanded={showDesc}
              onExpand={() => setShowDesc((prev) => !prev)}
              files={anime.relations.length}
            >
              {anime.relations.map((r) => (
                <button
                  key={`${r.relation_type}-${r.media.id}`}
                  onClick={() => {
                    onRelated?.(r.media.id);
                  }}
                  className="flex flex-row items-center min-h-20 gap-2 windows95-text hover:bg-surface cursor-pointer px-1 py-0.5 text-left"
                >
                  {r.media.cover_url && (
                    <img
                      src={r.media.cover_url}
                      alt=""
                      className="w-10 shrink-0 windows95-active-border"
                    />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[10px] font-bold truncate"
                      title={r.media.title}
                    >
                      {r.media.title}
                    </span>
                    <span className="text-[9px] text-muted">
                      {RELATION_LABELS[r.relation_type] ?? r.relation_type}
                      {r.media.format && <> · {r.media.format}</>}
                      {r.media.episodes && <> · {r.media.episodes} эп.</>}
                      {r.media.score && <> · ★ {r.media.score}</>}
                    </span>
                  </div>
                </button>
              ))}
            </Section>
          )}

          {anime.description && (
            <Section
              header="Описание"
              className="windows95-text leading-relaxed  overflow-y-auto whitespace-pre-line bg-white"
            >
              <textarea
                value={anime.description}
                readOnly
                disabled
                className="resize-y w-full h-36 min-h-18 max-h-64 select-none outline-0"
              />
            </Section>
          )}

          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <Section
              header="Жанры и теги"
              className="flex flex-wrap gap-1 bg-white"
            >
              {anime.genres.map((g) => (
                <Button
                  key={g}
                  onClick={() => {
                    onGenre(g);
                    onClose();
                  }}
                  className="flex flex-row gap-1 px-1 windows95-text bg-secondary hover:bg-secondary/60 text-white font-bold windows95-active-border"
                  variant="ghost"
                  title="Искать аниме по тегу"
                >
                  <CircleSmall className="size-3 fill-white" />
                  {g}
                </Button>
              ))}
              {anime.tags.slice(0, 15).map((t) => (
                <Button
                  key={t}
                  onClick={() => {
                    onTag(t);
                    onClose();
                  }}
                  className="flex flex-row gap-1 text-left windows95-text underline decoration-dotted bg-primary hover:bg-surface px-1 -mx-0.5 truncate"
                  variant="ghost"
                  title="Искать аниме по тегу"
                >
                  <Tag className="size-3" /> {t}
                </Button>
              ))}
            </Section>
          )}

          {(anime.title || anime.titles.length > 0) && (
            <Section
              header="Все названия"
              className="flex flex-wrap bg-white gap-1"
            >
              <Button
                onClick={() => handleSearchTorrents(anime.title)}
                className="flex flex-row gap-1 text-left windows95-text underline decoration-dotted bg-primary hover:bg-surface px-1 -mx-0.5 truncate"
                variant="ghost"
                title="Искать торренты по этому названию"
              >
                <ChevronRight className="size-3" /> {anime.title}
              </Button>
              {anime.titles.map((t) => (
                <Button
                  key={t}
                  onClick={() => handleSearchTorrents(t)}
                  className="text-left windows95-text underline decoration-dotted bg-primary hover:bg-surface px-1 -mx-0.5 truncate"
                  variant="ghost"
                  title="Искать торренты по этому названию"
                >
                  <ChevronRight className="size-3" /> {t}
                </Button>
              ))}
            </Section>
          )}

          <Section
            header="Статистика"
            className="flex flex-col gap-0.5 bg-white"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 windows95-text">
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
          </Section>

          {isLoggedIn && (
            <AniListActionControls
              anime={anime}
              listEntry={listEntry}
              onSaved={onSaved}
              onClose={onClose}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

export default AniListDetailModal;
