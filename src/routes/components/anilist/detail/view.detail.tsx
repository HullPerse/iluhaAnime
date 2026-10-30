import { useState } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useAnimeShowcase } from "@/hooks/showcase.hook";
import { setCrossSearchQuery } from "@/store/search.store";
import type { AniDetailViewProps as ViewProps } from "@/types/anilist/anilist";
import { detailErrorText } from "@/lib/anilist/detailError.utils";

import { DetailHeaderActions } from "@/routes/components/anilist/detail/actions.detail";
import AniListCharactersPanel from "@/routes/components/anilist/detail/characters.detail";
import AniListActionControls from "@/routes/components/anilist/detail/controls.detail";
import { FriendsScoresSection } from "@/routes/components/anilist/detail/friendsScores.detail";
import { GenresTagsSection } from "@/routes/components/anilist/detail/genres.detail";
import AniListMetadata from "@/routes/components/anilist/detail/metadata.detail";
import FranchiseGraphSection from "@/routes/components/anilist/detail/section.detail";
import { SimilarSection } from "@/routes/components/anilist/detail/similar.detail";
import { StudiosSection } from "@/routes/components/anilist/detail/studios.detail";
import { TitlesSection } from "@/routes/components/anilist/detail/titles.detail";

export function AniListDetailView({
  animeId,
  listEntry,
  scoreFormat,
  isLoggedIn,
  favouriteIds,
  onTag,
  onGenre,
  onSeason,
  onStudio,
  onRelated,
  entryLookup,
  onClose,
  onSaved,
  onTrailer,
  anime,
  initialCharacters,
  initialRecommendations,
  isLoading,
  isError,
  error,
  refetch,
  onPushScreen,
}: ViewProps) {
  const { t } = useI18n();
  const [showFranchise, setShowFranchise] = useState<boolean>(false);
  const [showDesc, setShowDesc] = useState<boolean>(false);
  const showcase = useAnimeShowcase(anime);
  const headerTrailerId = showcase?.trailerYoutubeId ?? null;
  const isFavorite = favouriteIds?.has(animeId) ?? false;
  const handleSearchTorrents = (query?: string) => {
    setCrossSearchQuery(query ?? anime?.title ?? "");
    onClose();
  };
  if (isLoading) return <TabLoader className="min-h-48 flex-1" />;
  if (isError) {
    return (
      <section className="flex flex-col items-center gap-2 p-4">
        <span className="text-destructive text-center">
          {detailErrorText(error, isLoggedIn, t)}
        </span>
        <Button onClick={refetch}>{t("anilist.details.retry")}</Button>
      </section>
    );
  }
  if (!anime) return <TabLoader className="min-h-48 flex-1" />;
  return (
    <section className="relative flex flex-col gap-2">
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
            scoreFormat={scoreFormat}
          />
        </div>
      </div>

      {anime.studios.length > 0 && (
        <StudiosSection studios={anime.studios} onStudio={onStudio} onClose={onClose} />
      )}
      <AniListCharactersPanel
        animeId={anime.id}
        initialEdges={initialCharacters}
        onCharacterClick={(id, name, voiceActors) =>
          onPushScreen({ kind: "character", id, name, voiceActors })
        }
        onVoiceActorClick={(character, voiceActor) => {
          onPushScreen({ kind: "character", ...character });
          onPushScreen({ kind: "staff", id: voiceActor.id, name: voiceActor.name });
        }}
      />

      <Section
        header={t("anilist.details.franchise")}
        className="bg-primary"
        expanded={showFranchise}
        onExpand={() => setShowFranchise((prev) => !prev)}
      >
        <FranchiseGraphSection
          animeId={anime.id}
          entryLookup={entryLookup}
          scoreFormat={scoreFormat}
          onRelated={onRelated}
          expanded={showFranchise}
        />
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

      <SimilarSection
        animeId={anime.id}
        relations={anime.relations}
        initialRecs={initialRecommendations}
        onRelated={onRelated}
      />

      <FriendsScoresSection animeId={anime.id} />

      <AniListActionControls
        anime={anime}
        listEntry={listEntry}
        scoreFormat={scoreFormat}
        isLoggedIn={isLoggedIn}
        onSaved={onSaved}
        onClose={onClose}
      />
    </section>
  );
}
