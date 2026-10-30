import type { AniListCollection, AniUserProfile, FavouriteAnime } from "@/types/anilist/anilist";
import type { EntryLookup } from "@/types/anilist/entries";

export interface FriendSourceData {
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  entryLookup: EntryLookup;
  displayFavouriteIds: Set<number>;
  profile: AniUserProfile | null;
}
