import Details from "@/routes/components/anilist/detail/modal.detail";
import type { AniListDetailModalHostProps } from "@/types/anilist";

export default function AniListDetailModalHost({
  selectedAnime,
  favouriteIds,
  isLoggedIn,
  onFavouriteToggle,
  onTag,
  onGenre,
  onStudio,
  onSeason,
  onRelated,
  onBack,
  onClose,
  onSaved,
}: AniListDetailModalHostProps) {
  if (!selectedAnime) return null;
  return (
    <Details
      animeId={selectedAnime.animeId}
      listEntry={selectedAnime.listEntry}
      isLoggedIn={isLoggedIn}
      favouriteIds={favouriteIds}
      onFavouriteToggle={onFavouriteToggle}
      onTag={onTag}
      onGenre={onGenre}
      onStudio={onStudio}
      onSeason={onSeason}
      onRelated={onRelated}
      onBack={onBack}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
