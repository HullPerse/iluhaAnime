import { cn } from "cn";
import { ChevronRight, CircleSmall, Heart, Tag, Users, Star } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { DETAIL_TAG_COUNT } from "@/config/anilist/filters.config";
import { RELATION_LABEL, SUPPORTED_RELATION_TYPES } from "@/config/anilist/graph.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { useSearchStore } from "@/store/search.store";
import type { AniVoiceActor } from "@/types/anilist";
import type { AniDetailViewProps as ViewProps } from "@/types/anilist";

import { AnilistStills } from "../stills.anilist";
import AniListCharacterDetailModal from "./character.detail";
import AniListCharactersPanel from "./characters.detail";
import AniListActionControls from "./controls.detail";
import AniListMetadata from "./metadata.detail";
import FranchiseGraphSection from "./section.detail";

// oxlint-disable-next-line complexity
export function AniListDetailView({
  animeId,
  listEntry,
  isLoggedIn,
  favouriteIds,
  onFavouriteToggle,
  onTag,
  onGenre,
  onSeason,
  onStudio,
  onRelated,
  onClose,
  onSaved,
  anime,
  isLoading,
  isError,
  error,
  refetch,
}: ViewProps) {
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
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const isFavorite = favouriteIds?.has(animeId) ?? false;
  const toggleFavorite = () => {
    if (favoriteLoading) return;
    setFavoriteLoading(true);
    onFavouriteToggle?.(animeId);
    setFavoriteLoading(false);
  };
  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };
  if (isLoading) return <SmallLoader size={6} className="windows95-text" />;
  if (isError)
    return (
      <section className="flex flex-col items-center gap-2 p-4">
        <span className="text-destructive text-center">
          {String(error ?? t("anilist.details.load.error"))}
        </span>
        <Button onClick={refetch}>{t("anilist.details.retry")}</Button>
      </section>
    );
  if (!anime) return <SmallLoader size={6} className="windows95-text" />;
  const relatedRelations = anime.relations.filter((r) =>
    SUPPORTED_RELATION_TYPES.has(r.media.media_type ?? "")
  );
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
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
            disabled={favoriteLoading}
            onClick={toggleFavorite}
            title={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
            aria-label={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
          >
            {favoriteLoading ? (
              <SmallLoader size={3} />
            ) : (
              <Heart
                className={cn("size-4", isFavorite ? "fill-red-500 text-red-500" : "text-text")}
              />
            )}
          </Button>
        )}
      </div>

      {anime.studios.length > 0 && (
        <Section header={t("anilist.details.studios")} className="flex flex-wrap gap-1 bg-white">
          {anime.studios.map((s, i) => (
            <Button
              key={i}
              onClick={() => {
                onStudio?.(s.id, s.name);
                onClose();
              }}
              className="bg-primary windows95-text flex flex-row gap-1 px-1 underline decoration-dotted"
              variant="ghost"
              title={t("anilist.details.studio.search")}
            >
              <Users className="size-3" /> {s.name}
            </Button>
          ))}
        </Section>
      )}
      <AnilistStills anime={anime} />
      <AniListCharactersPanel
        animeId={anime.id}
        onCharacterClick={(id, name, voiceActors) =>
          setSelectedCharacter({ id, name, voiceActors })
        }
      />

      {relatedRelations.length > 0 && (
        <Section
          header={t("anilist.details.related")}
          className="flex flex-wrap gap-1 bg-white"
          expanded={showRelations}
          onExpand={() => setShowRelations((prev) => !prev)}
          files={relatedRelations.length}
        >
          {relatedRelations.map((r) => (
            <div
              role="button"
              tabIndex={0}
              aria-label={r.media.title}
              key={`${r.relation_type}-${r.media.id}`}
              title={r.media.title}
              onClick={() => onRelated?.(r.media.id)}
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
                <span className="windows95-text line-clamp-1 font-bold">{r.media.title}</span>
                <div className="flex flex-col text-xs">
                  <span className="ml-1 flex flex-row gap-1">
                    {`[ ${t(RELATION_LABEL[r.relation_type] as never) ?? r.relation_type} ]`}
                  </span>
                  <span>
                    - {t("anilist.details.format")}: {r.media.format && <>{r.media.format}</>}
                  </span>
                  <span className="flex flex-row gap-1">
                    - {t("anilist.details.rating")}:{" "}
                    {r.media.score && (
                      <>
                        {" "}
                        <Star className="inline size-2" /> {r.media.score}
                      </>
                    )}
                  </span>
                  <span className="flex flex-row gap-1">
                    - {t("anilist.details.episodes")}:
                    {r.media.episodes && (
                      <>
                        {" "}
                        {r.media.episodes} {t("anilist.details.eps.short")}
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
        <FranchiseGraphSection animeId={anime.id} onRelated={onRelated} expanded={showFranchise} />
      </Section>

      {anime.description && (
        <Section
          header={t("anilist.details.description")}
          className="windows95-text overflow-y-auto bg-white leading-relaxed whitespace-pre-line"
          expanded={showDesc}
          onExpand={() => setShowDesc((prev) => !prev)}
        >
          <div className="h-36 max-h-64 min-h-18 w-full overflow-y-auto outline-0">
            {anime.description}
          </div>
        </Section>
      )}

      {(anime.genres.length > 0 || anime.tags.length > 0) && (
        <Section
          header={t("anilist.details.genres.tags")}
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
              title={t("anilist.details.genre.search")}
            >
              <CircleSmall className="size-3 fill-white" />
              {g}
            </Button>
          ))}
          {anime.tags.slice(0, DETAIL_TAG_COUNT).map((tag) => (
            <Button
              key={tag}
              onClick={() => {
                onTag(tag);
                onClose();
              }}
              className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
              variant="ghost"
              title={t("anilist.details.genre.search")}
            >
              <Tag className="size-3" /> {tag}
            </Button>
          ))}
        </Section>
      )}

      {(anime.title || anime.titles.length > 0) && (
        <Section header={t("anilist.details.all.titles")} className="flex flex-wrap gap-1 bg-white">
          <Button
            onClick={() => handleSearchTorrents(anime.title)}
            className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
            variant="ghost"
            title={t("anilist.details.torrent.search")}
          >
            <ChevronRight className="size-3" /> {anime.title}
          </Button>
          {anime.titles.map((title) => (
            <Button
              key={title}
              onClick={() => handleSearchTorrents(title)}
              className="windows95-text bg-primary hover:bg-surface -mx-0.5 truncate px-1 text-left underline decoration-dotted"
              variant="ghost"
              title={t("anilist.details.torrent.search")}
            >
              <ChevronRight className="size-3" /> {title}
            </Button>
          ))}
        </Section>
      )}

      <Section header={t("anilist.details.statistics")} className="flex flex-col gap-0.5 bg-white">
        <div className="windows95-text flex flex-wrap gap-x-4 gap-y-0.5">
          {anime.popularity && (
            <span>
              {t("anilist.details.popularity")}: #{anime.popularity.toLocaleString(locale)}
            </span>
          )}
          {anime.favourites && (
            <span>
              {t("anilist.details.favourites")}: {anime.favourites.toLocaleString(locale)}
            </span>
          )}
        </div>
      </Section>

      <AniListActionControls
        anime={anime}
        listEntry={listEntry}
        onSaved={onSaved}
        onClose={onClose}
      />

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
    </section>
  );
}
