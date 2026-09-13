import type { EntryLookup } from "@/lib/anilist/entries.utils";
import type {
  AniFriend,
  AniListCaps,
  AniListCollection,
  AniListSource,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
} from "@/types/anilist";

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

export interface FriendSourceData {
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  entryLookup: EntryLookup;
  displayFavouriteIds: Set<number>;
  profile: AniUserProfile | null;
}

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
