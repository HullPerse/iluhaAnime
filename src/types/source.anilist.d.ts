import type { AniListCollection, AniUserProfile, FavouriteAnime } from "@/types/anilist";
import type { EntryLookup } from "@/types/entries";

export interface FriendSourceData {
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  entryLookup: EntryLookup;
  displayFavouriteIds: Set<number>;
  profile: AniUserProfile | null;
}
