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
  onStudio,
  onRelated,
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
  onTag: (e: string) => void;
  onStudio?: (id: number, name: string) => void;
  onRelated?: (id: number) => void;
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
    <Modal
      header={anime?.title ?? "Загрузка..."}
      onClose={onClose}
      className="w-3xl"
    >
      {isLoading || !anime ? (
        <div className="flex items-center justify-center flex-1">
          <Loader className="size-6 animate-spin windows95-text" />
        </div>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto min-h-0 flex-1 pb-1">
          <AniListMetadata anime={anime} />

          {anime.studios.length > 0 && (
            <Section header="Студии" className="flex flex-wrap gap-1 bg-white">
              {anime.studios.map((s, i) => (
                <Button
                  key={i}
                  onClick={() => {
                    onStudio?.(s.id, s.name);
                    onClose();
                  }}
                  className="px-1 bg-primary windows95-text underline decoration-dotted"
                  variant="ghost"
                  title="Искать аниме этой студии"
                >
                  {s.name}
                </Button>
              ))}
            </Section>
          )}

          {anime.relations.length > 0 && (
            <Section header="Связанное" className="flex flex-col bg-white">
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
              className="windows95-text leading-relaxed max-h-36 overflow-y-auto whitespace-pre-line bg-white"
            >
              {anime.description}
            </Section>
          )}

          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <Section
              header="Жанры и теги"
              className="flex flex-wrap gap-1 bg-white"
            >
              {anime.genres.map((g) => (
                <span
                  key={g}
                  className="px-1 windows95-text bg-secondary text-white font-bold windows95-active-border"
                >
                  {g}
                </span>
              ))}
              {anime.tags.slice(0, 15).map((t) => (
                <Button
                  key={t}
                  onClick={() => {
                    onTag(t);
                    onClose();
                  }}
                  className="text-left windows95-text underline decoration-dotted bg-primary hover:bg-surface px-1 -mx-0.5 truncate"
                  variant="ghost"
                  title="Искать аниме по тегу"
                >
                  ◉ {t}
                </Button>
              ))}
            </Section>
          )}

          {anime.titles.length > 0 && (
            <Section header="Все названия" className="flex flex-col gap-0.5">
              {anime.titles.map((t) => (
                <Button
                  key={t}
                  onClick={() => handleSearchTorrents(t)}
                  className="text-left text-[10px] windows95-text underline decoration-dotted hover:bg-surface px-0.5 -mx-0.5 truncate"
                  variant="ghost"
                  title="Искать торренты по этому названию"
                >
                  ◉ {t}
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
