import { cn } from "cn";
import { ChevronRight, CircleSmall, Heart, Tag, Users } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { DETAIL_TAG_COUNT } from "@/config/anilist/filters.config";
import { useFavPeopleAnimeSet } from "@/hooks/anilist/people.hook";
import { useAnimeShowcase } from "@/hooks/showcase.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSearchStore } from "@/store/search.store";
import type { AniVoiceActor } from "@/types/anilist";
import type { AniDetailViewProps as ViewProps } from "@/types/anilist";

import AniListCharacterDetailModal from "./character.detail";
import AniListCharactersPanel from "./characters.detail";
import AniListActionControls from "./controls.detail";
import AniListMetadata from "./metadata.detail";
import QuickAddButton from "./quickadd.detail";
import FranchiseGraphSection from "./section.detail";
import { SimilarSection } from "./similar.detail";

// oxlint-disable-next-line complexity
export function AniListDetailView({
  animeId,
  listEntry,
  isLoggedIn,
  favouriteIds,
  favouriteStaffIds,
  favouriteCharacterIds,
  onFavouriteToggle,
  onStaffFavouriteToggle,
  onCharacterFavouriteToggle,
  onTag,
  onGenre,
  onSeason,
  onStudio,
  onRelated,
  onClose,
  onSaved,
  onTrailer,
  anime,
  isLoading,
  isError,
  error,
  refetch,
}: ViewProps) {
  const { t } = useI18n();
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);

  const [showFranchise, setShowFranchise] = useState<boolean>(false);
  const [showDesc, setShowDesc] = useState<boolean>(false);
  const [selectedCharacter, setSelectedCharacter] = useState<{
    id: number;
    name: string;
    voiceActors: AniVoiceActor[];
  } | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const showcase = useAnimeShowcase(anime);
  const headerTrailerId = showcase?.trailerYoutubeId ?? null;
  const isFavorite = favouriteIds?.has(animeId) ?? false;
  const hasFavouritePeople = useFavPeopleAnimeSet().has(animeId);
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
  if (isLoading) {
    return (
      <div className="flex min-h-48 flex-1 items-center justify-center">
        <SmallLoader size={6} className="windows95-text" />
      </div>
    );
  }
  if (isError) {
    const loginRequired = !isLoggedIn && /403/.test(String(error ?? ""));
    return (
      <section className="flex flex-col items-center gap-2 p-4">
        <span className="text-destructive text-center">
          {loginRequired
            ? t("anilist.details.login.required")
            : String(error ?? t("anilist.details.load.error"))}
        </span>
        <Button onClick={refetch}>{t("anilist.details.retry")}</Button>
      </section>
    );
  }
  if (!anime) {
    return (
      <div className="flex min-h-48 flex-1 items-center justify-center">
        <SmallLoader size={6} className="windows95-text" />
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <AniListMetadata
            anime={anime}
            hasFavouritePeople={hasFavouritePeople}
            onSeason={(s, y) => {
              onSeason?.(s, y);
              onClose();
            }}
          />
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch">
          {isLoggedIn ? (
            <Button
              size="icon"
              className="shrink-0"
              disabled={favoriteLoading}
              onClick={toggleFavorite}
              title={isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")}
              aria-label={
                isFavorite ? t("anilist.details.remove.fav") : t("anilist.details.add.fav")
              }
            >
              {favoriteLoading ? (
                <SmallLoader size={3} />
              ) : (
                <Heart
                  className={cn("size-4", isFavorite ? "fill-red-500 text-red-500" : "text-text")}
                />
              )}
            </Button>
          ) : (
            <span />
          )}
          {headerTrailerId ? (
            <div className="flex flex-row gap-2">
              <Button
                className="h-5 shrink-0 px-1 text-xs"
                onClick={() => onTrailer?.(headerTrailerId)}
              >
                {t("anilist.details.trailer")}
              </Button>
              <QuickAddButton anime={anime} listEntry={listEntry} isFavorite={isFavorite} />
            </div>
          ) : null}
        </div>
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
      <AniListCharactersPanel
        animeId={anime.id}
        onCharacterClick={(id, name, voiceActors) =>
          setSelectedCharacter({ id, name, voiceActors })
        }
      />

      <Section
        header={t("anilist.details.related")}
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
          <textarea
            readOnly
            value={anime.description}
            className="h-36 max-h-64 min-h-18 w-full overflow-y-auto outline-0"
          />
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

      <SimilarSection animeId={anime.id} relations={anime.relations} onRelated={onRelated} />

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
          isLoggedIn={isLoggedIn}
          favouriteCharacterIds={favouriteCharacterIds}
          favouriteStaffIds={favouriteStaffIds}
          onCharacterFavouriteToggle={onCharacterFavouriteToggle}
          onStaffFavouriteToggle={onStaffFavouriteToggle}
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
