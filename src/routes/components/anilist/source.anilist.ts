import type { EntryLookup } from "@/types/anilist/entries";
import type {
  AniFriend,
  AniListCaps,
  AniListCollection,
  AniListSource,
  AniUser,
  FavouriteAnime,
} from "@/types/anilist/anilist";
import type { FriendSourceData } from "@/types/search/source.anilist";

const SELF_CAPS: AniListCaps = {
  headerActions: true,
  listActions: true,
  modals: true,
  search: true,
};

const FRIEND_CAPS: AniListCaps = {
  headerActions: false,
  listActions: false,
  modals: false,
  search: false,
};

export function buildAniListSource(params: {
  user: AniUser | null;
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  entryLookup: EntryLookup;
  favouriteIds: Set<number>;
  friend: AniFriend | null;
  friendData: FriendSourceData | null;
}): AniListSource {
  const { user, lists, favourites, entryLookup, favouriteIds, friend, friendData } = params;
  if (friend && friendData) {
    return {
      caps: FRIEND_CAPS,
      displayFavouriteIds: friendData.displayFavouriteIds,
      displayLookup: friendData.entryLookup,
      favourites: friendData.favourites,
      friend,
      friendProfile: friendData.profile,
      lists: friendData.lists,
      mode: "friend",
      myEntryLookup: entryLookup,
      myFavouriteIds: favouriteIds,
      user,
    };
  }
  return {
    caps: SELF_CAPS,
    displayFavouriteIds: favouriteIds,
    displayLookup: entryLookup,
    favourites,
    friend: null,
    friendProfile: null,
    lists,
    mode: "self",
    myEntryLookup: entryLookup,
    myFavouriteIds: favouriteIds,
    user,
  };
}
