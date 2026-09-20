import { useState } from "react";

import { TabLoader } from "@/components/shared/loader.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useAnimeShowcase } from "@/hooks/showcase.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSearchStore } from "@/store/search.store";
import type { AniVoiceActor } from "@/types/anilist";
import type { AniDetailViewProps as ViewProps } from "@/types/anilist";

import { DetailHeaderActions } from "./actions.detail";
import AniListCharacterDetailModal from "./character.detail";
import AniListCharactersPanel from "./characters.detail";
import AniListActionControls from "./controls.detail";
import { FriendsScoresSection } from "./friendsScores.detail";
import { GenresTagsSection } from "./genres.detail";
import AniListMetadata from "./metadata.detail";
import FranchiseGraphSection from "./section.detail";
import { SimilarSection } from "./similar.detail";
import { StudiosSection } from "./studios.detail";
import { TitlesSection } from "./titles.detail";

/** What the character window opens on: a character, optionally with a voice actor pushed over it. */
type CharacterTarget = {
  id: number;
  name: string;
  voiceActors: AniVoiceActor[];
  staff?: AniVoiceActor;
};

/**
 * The character window. It seeds its screen stack once, so a different character or voice actor
 * needs a fresh instance (the `key`) rather than new props on the old one.
 */
function CharacterWindow({
  target,
  isLoggedIn,
  favouriteCharacterIds,
  favouriteStaffIds,
  onCharacterFavouriteToggle,
  onStaffFavouriteToggle,
  onRelated,
  onClose,
}: {
  target: CharacterTarget;
  isLoggedIn: boolean;
  favouriteCharacterIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  onCharacterFavouriteToggle?: (id: number) => void;
  onStaffFavouriteToggle?: (id: number) => void;
  onRelated: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <AniListCharacterDetailModal
      key={`${target.id}:${target.staff?.id ?? ""}`}
      characterId={target.id}
      characterName={target.name}
      voiceActors={target.voiceActors}
      initialStaff={target.staff}
      isLoggedIn={isLoggedIn}
      favouriteCharacterIds={favouriteCharacterIds}
      favouriteStaffIds={favouriteStaffIds}
      onCharacterFavouriteToggle={onCharacterFavouriteToggle}
      onStaffFavouriteToggle={onStaffFavouriteToggle}
      onRelated={onRelated}
      onClose={onClose}
    />
  );
}

export function AniListDetailView({
  animeId,
  listEntry,
  isLoggedIn,
  favouriteIds,
  favouriteStaffIds,
  favouriteCharacterIds,
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
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterTarget | null>(null);
  const showcase = useAnimeShowcase(anime);
  const headerTrailerId = showcase?.trailerYoutubeId ?? null;
  const isFavorite = favouriteIds?.has(animeId) ?? false;
  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };
  if (isLoading) return <TabLoader className="min-h-48 flex-1" />;
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
  if (!anime) return <TabLoader className="min-h-48 flex-1" />;
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
        <div className="flex shrink-0 flex-col items-end justify-between gap-1 self-stretch">
          <DetailHeaderActions
            isFavorite={isFavorite}
            trailerId={headerTrailerId}
            onTrailer={onTrailer}
            anime={anime}
            listEntry={listEntry}
          />
        </div>
      </div>

      {anime.studios.length > 0 && (
        <StudiosSection studios={anime.studios} onStudio={onStudio} onClose={onClose} />
      )}
      <AniListCharactersPanel
        animeId={anime.id}
        onCharacterClick={(id, name, voiceActors) =>
          setSelectedCharacter({ id, name, voiceActors })
        }
        onVoiceActorClick={(character, voiceActor) =>
          setSelectedCharacter({ ...character, staff: voiceActor })
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
          className="windows95-text bg-field overflow-y-auto leading-relaxed whitespace-pre-line"
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
        <GenresTagsSection
          genres={anime.genres}
          tags={anime.tags}
          onGenre={onGenre}
          onTag={onTag}
          onClose={onClose}
        />
      )}

      {(anime.title || anime.titles.length > 0) && (
        <TitlesSection anime={anime} onSearchTorrents={handleSearchTorrents} />
      )}

      <SimilarSection animeId={anime.id} relations={anime.relations} onRelated={onRelated} />

      <FriendsScoresSection animeId={anime.id} />

      <AniListActionControls
        anime={anime}
        listEntry={listEntry}
        onSaved={onSaved}
        onClose={onClose}
      />

      {selectedCharacter && (
        <CharacterWindow
          target={selectedCharacter}
          isLoggedIn={isLoggedIn}
          favouriteCharacterIds={favouriteCharacterIds}
          favouriteStaffIds={favouriteStaffIds}
          onCharacterFavouriteToggle={onCharacterFavouriteToggle}
          onStaffFavouriteToggle={onStaffFavouriteToggle}
          // The caller's `onRelated` opens the anime in the modal behind this window, so this one
          // has to close first.
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
