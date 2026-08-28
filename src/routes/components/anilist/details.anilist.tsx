import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Heart } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { AniMedia, AniVoiceActor } from "@/types/anilist";

import AniListCharacterDetailModal from "./details.character";
import AniListCharactersPanel from "./details.characters";
import AniListActionControls from "./details.controls";
import FranchiseGraphSection from "./details.franchise";
import AniListMetadata from "./details.metadata";

type DetailProps = {
  animeId: number;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
  };
  isLoggedIn: boolean;
  favouriteIds?: Set<number>;
  onFavouriteToggle?: (animeId: number) => void;
  onTag: (value: string) => void;
  onGenre: (value: string) => void;
  onSeason?: (season: string, year: number | null) => void;
  onStudio?: (id: number, name: string) => void;
  onRelated?: (id: number) => void;
  onBack?: () => void;
  onClose: () => void;
  onSaved?: () => void;
};
type ViewProps = DetailProps & {
  anime?: AniMedia;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

function AniListDetailView({
  animeId,
  listEntry,
  isLoggedIn,
  favouriteIds,
  onFavouriteToggle,
  onRelated,
  onClose,
  onSaved,
  anime,
  isLoading,
  isError,
  error,
  refetch,
}: ViewProps) {
  const { t } = useI18n();
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
  if (isLoading) return <SmallLoader size={6} className="windows95-text" />;
  if (isError)
    return (
      <section className="flex flex-col items-center gap-2 p-4">
        <span className="text-destructive text-center">
          {String(error ?? t("anilist.details.loadError"))}
        </span>
        <Button onClick={refetch}>{t("anilist.details.retry")}</Button>
      </section>
    );
  if (!anime) return <SmallLoader size={6} className="windows95-text" />;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <AniListMetadata anime={anime} />
        </div>
        {isLoggedIn && (
          <Button
            size="icon"
            disabled={favoriteLoading}
            onClick={toggleFavorite}
            aria-label={
              isFavorite
                ? t("anilist.details.removeFav")
                : t("anilist.details.addFav")
            }
          >
            {favoriteLoading ? (
              <SmallLoader size={3} />
            ) : (
              <Heart
                className={`size-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-text"}`}
              />
            )}
          </Button>
        )}
      </div>
      <AniListCharactersPanel
        animeId={anime.id}
        onCharacterClick={(id, name, voiceActors) =>
          setSelectedCharacter({ id, name, voiceActors })
        }
      />
      <FranchiseGraphSection
        animeId={anime.id}
        onRelated={onRelated}
        expanded
      />
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
          onRelated={onRelated}
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </section>
  );
}

function AniListDetailModal(props: DetailProps) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["anime_detail", props.animeId],
    queryFn: () => invoke<AniMedia>("get_anime_by_id", { id: props.animeId }),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });
  return (
    <Modal
      header={query.data?.title ?? t("anilist.details.loading")}
      onClose={props.onClose}
      onBack={props.onBack}
      className="min-w-2xl"
    >
      <AniListDetailView
        {...props}
        anime={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        refetch={query.refetch}
      />
    </Modal>
  );
}

export default AniListDetailModal;
