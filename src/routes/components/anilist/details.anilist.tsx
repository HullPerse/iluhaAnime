import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  CircleSmall,
  Heart,
  Loader,
  Tag,
  Users,
  Star,
} from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { RELATION_LABEL, SUPPORTED_RELATION_TYPES } from "@/config/anilist.config";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { useSearchStore } from "@/store/search.store";
import type { AniMedia, AniVoiceActor } from "@/types/anilist";

import AniListCharactersPanel from "./details.characters";
import AniListActionControls from "./details.controls";
import AniListCharacterDetailModal from "./details.character";
import FranchiseGraphSection from "./details.franchise";
import AniListMetadata from "./details.metadata";

function AniListDetailModal({
  animeId,
  listEntry,
  isLoggedIn,
  onTag,
  onGenre,
  onSeason,
  onStudio,
  onRelated,
  onBack,
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
  onSeason?: (season: string, seasonYear: number | null) => void;
  onStudio?: (id: number, name: string) => void;
  onRelated?: (id: number) => void;
  onBack?: () => void;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t, locale } = useI18n();
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);

  const [showRelations, setShowRelations] = useState<boolean>(false);
  const [showFranchise, setShowFranchise] = useState<boolean>(false);
  const [showDesc, setShowDesc] = useState<boolean>(false);
  const [selectedCharacter, setSelectedCharacter] = useState<{
    id: number;
    name: string;
    voiceActors: AniVoiceActor[];
  } | null>(null);

  const [favLoading, setFavLoading] = useState(false);
  const isFavourited = favouriteIds?.has(animeId) ?? false;

  const handleToggleFav = () => {
    if (favLoading) return;
    setFavLoading(true);
    onFavouriteToggle?.(animeId);
    setFavLoading(false);
  };

  const {
    data: anime,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["anime_detail", animeId],
    queryFn: () => invoke<AniMedia>("get_anime_by_id", { id: animeId }),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };

  return (
    <Modal
      header={anime?.title ?? t("anilist.details.loading")}
      onClose={onClose}
      onBack={onBack}
      className="min-w-2xl"
    >
      {isLoading ? (
        <section className="flex flex-1 items-center justify-center">
          <Loader className="windows95-text size-6 animate-spin" />
        </section>
      ) : isError ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
          <span className="windows95-text text-destructive text-center">
            {String(error ?? "") || t("anilist.details.loadError")}
          </span>
          <Button
            onClick={() => refetch()}
            className="windows95-text bg-primary windows95-active-border cursor-pointer px-2 py-0.5"
            variant="ghost"
          >
            {t("anilist.details.retry")}
          </Button>
        </section>
      ) : anime ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-row items-start gap-2">
            <div className="flex-1">
              <AniListMetadata
                anime={anime}
                onSeason={(s, y) => {
                  onSeason?.(s, y);
                  onClose();
                }}
              />
            </div>
            {isLoggedIn && (
              <Button
                size="icon"
                className="shrink-0"
                disabled={favLoading}
                onClick={handleToggleFav}
                title={
                  isFavourited
                    ? t("anilist.details.removeFav")
                    : t("anilist.details.addFav")
                }
              >
                {favLoading ? (
                  <Loader className="size-3 animate-spin" />
                ) : (
                  <Heart
                    className={`size-4 ${isFavourited ? "fill-red-500 text-red-500" : "text-text"}`}
                  />
                )}
              </Button>
            )}
          </div>

          {anime.studios.length > 0 && (
            <Section
              header={t("anilist.details.studios")}
              className="flex flex-wrap gap-1 bg-white"
            >
              {anime.studios.map((s, i) => (
                <Button
                  key={i}
                  onClick={() => {
                    onStudio?.(s.id, s.name);
                    onClose();
                  }}
                  className="bg-primary windows95-text flex flex-row gap-1 px-1 underline decoration-dotted"
                  variant="ghost"
                  title={t("anilist.details.studioSearch")}
                >
                  <Users className="size-3" /> {s.name}
                </Button>
              ))}
            </Section>
          )}

          <AniListCharactersPanel
            animeId={anime.id}
            onCharacterClick={(id, name, vas) =>
              setSelectedCharacter({ id, name, voiceActors: vas })
            }
          />

          {anime.relations.filter((r) =>
            SUPPORTED_RELATION_TYPES.has(r.media.media_type ?? "")
          ).length > 0 && (
            <Section
              header={t("anilist.details.related")}
              className="flex flex-wrap gap-1 bg-white"
              expanded={showRelations}
              onExpand={() => setShowRelations((prev) => !prev)}
              files={
                anime.relations.filter((r) =>
                  SUPPORTED_RELATION_TYPES.has(r.media.media_type ?? "")
                ).length
              }
            >
              {anime.relations
                .filter((r) =>
                  SUPPORTED_RELATION_TYPES.has(r.media.media_type ?? "")
                )
                .map((r) => (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={r.media.title}
                    key={`${r.relation_type}-${r.media.id}`}
                    title={r.media.title}
                    onClick={() => {
                      onRelated?.(r.media.id);
                    }}
                    onKeyDown={enterOrSpace(() => onRelated?.(r.media.id))}
                    className="windows95-active-border windows95-text hover:bg-surface bg-primary flex h-20 w-50 cursor-pointer flex-row items-center gap-2 px-1 py-0.5 text-left"
                  >
                    {r.media.cover_url && (
                      <ImageComponent
                        src={r.media.cover_url}
                        alt="cover_url"
                        className="windows95-active-border h-18 w-13 shrink-0"
                      />
                    )}
                    <section className="flex flex-col gap-1 leading-tight">
                      <span className="windows95-text line-clamp-1 font-bold">
                        {r.media.title}
                      </span>
                      <div className="flex flex-col text-[9px]">
                        <span className="ml-1 flex flex-row gap-1">
                          {`[ ${t(RELATION_LABEL[r.relation_type] as never) ?? r.relation_type} ]`}
                        </span>
                        <span>
                          · {t("anilist.details.format")}:{" "}
                          {r.media.format && <>{r.media.format}</>}
                        </span>

                        <span className="flex flex-row gap-1">
                          · {t("anilist.details.rating")}:{" "}
                          {r.media.score && (
                            <>
                              {" "}
                              <Star className="inline size-2" /> {r.media.score}
                            </>
                          )}
                        </span>
                        <span className="flex flex-row gap-1">
                          · {t("anilist.details.episodes")}:
                          {r.media.episodes && (
                            <>
                              {" "}
                              {r.media.episodes} {t("anilist.details.epsShort")}
                            </>
                          )}
                        </span>
                      </div>
                    </section>
                  </div>
                ))}
            </Section>
          )}

          <Section
            header={t("anilist.details.franchise")}
            className="bg-primary"
            expanded={showFranchise}
            onExpand={() => setShowFranchise((prev) => !prev)}
          >
            <FranchiseGraphSection
              animeId={anime.id}
              onRelated={onRelated}
              expanded={showFranchise}
            />
          </Section>

          {anime.description && (
            <Section
              header={t("anilist.details.description")}
              className="windows95-text overflow-y-auto bg-white leading-relaxed whitespace-pre-line"
              expanded={showDesc}
              onExpand={() => setShowDesc((prev) => !prev)}
            >
              <textarea
                value={anime.description}
                readOnly
                disabled
                className="h-36 max-h-64 min-h-18 w-full resize-y outline-0 select-none"
              />
            </Section>
          )}

          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <Section
              header={t("anilist.details.genresTags")}
              className="flex flex-wrap gap-1 bg-white"
            >
              {anime.genres.map((g) => (
                <Button
                  key={g}
                  onClick={() => {
                    onGenre(g);
                    onClose();
                  }}
                  className="windows95-text bg-secondary hover:bg-secondary/60 windows95-active-border flex flex-row gap-1 px-1 font-bold text-white"
                  variant="ghost"
                  title={t("anilist.details.genreSearch")}
                >
                  <CircleSmall className="size-3 fill-white" />
                  {g}
                </Button>
              ))}
              {anime.tags.slice(0, 15).map((tag) => (
                <Button
                  key={tag}
                  onClick={() => {
                    onTag(tag);
                    onClose();
                  }}
                  className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
                  variant="ghost"
                  title={t("anilist.details.genreSearch")}
                >
                  <Tag className="size-3" /> {tag}
                </Button>
              ))}
            </Section>
          )}

          {(anime.title || anime.titles.length > 0) && (
            <Section
              header={t("anilist.details.allTitles")}
              className="flex flex-wrap gap-1 bg-white"
            >
              <Button
                onClick={() => handleSearchTorrents(anime.title)}
                className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
                variant="ghost"
                title={t("anilist.details.torrentSearch")}
              >
                <ChevronRight className="size-3" /> {anime.title}
              </Button>
              {anime.titles.map((title) => (
                <Button
                  key={title}
                  onClick={() => handleSearchTorrents(title)}
                  className="windows95-text bg-primary hover:bg-surface -mx-0.5 truncate px-1 text-left underline decoration-dotted"
                  variant="ghost"
                  title={t("anilist.details.torrentSearch")}
                >
                  <ChevronRight className="size-3" /> {title}
                </Button>
              ))}
            </Section>
          )}

          <Section
            header={t("anilist.details.statistics")}
            className="flex flex-col gap-0.5 bg-white"
          >
            <div className="windows95-text flex flex-wrap gap-x-4 gap-y-0.5">
              {anime.popularity && (
                <span>
                  {t("anilist.details.popularity")}: #
                  {anime.popularity.toLocaleString(locale)}
                </span>
              )}
              {anime.favourites && (
                <span>
                  {t("anilist.details.favourites")}:{" "}
                  {anime.favourites.toLocaleString(locale)}
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
        </section>
      ) : (
        <section className="flex flex-1 items-center justify-center">
          <Loader className="windows95-text size-6 animate-spin" />
        </section>
      )}

      {selectedCharacter && (
        <AniListCharacterDetailModal
          characterId={selectedCharacter.id}
          characterName={selectedCharacter.name}
          voiceActors={selectedCharacter.voiceActors}
          onRelated={(id) => {
            setSelectedCharacter(null);
            onRelated?.(id);
          }}
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </Modal>
  );
}

export default AniListDetailModal;
