import Details from "@/routes/components/anilist/detail/modal.detail";
import type { AniListDetailModalHostProps } from "@/types/anilist";

export default function AniListDetailModalHost({
  selectedAnime,
  entryLookup,
  scoreFormat,
  favouriteIds,
  favouriteStaffIds,
  favouriteCharacterIds,
  isLoggedIn,
  onFavouriteToggle,
  onStaffFavouriteToggle,
  onCharacterFavouriteToggle,
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
      entryLookup={entryLookup}
      listEntry={selectedAnime.listEntry}
      scoreFormat={scoreFormat}
      isLoggedIn={isLoggedIn}
      favouriteIds={favouriteIds}
      favouriteStaffIds={favouriteStaffIds}
      favouriteCharacterIds={favouriteCharacterIds}
      onFavouriteToggle={onFavouriteToggle}
      onStaffFavouriteToggle={onStaffFavouriteToggle}
      onCharacterFavouriteToggle={onCharacterFavouriteToggle}
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
