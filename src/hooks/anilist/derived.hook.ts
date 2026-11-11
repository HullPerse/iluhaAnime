import { useMemo } from "react";

import { anilistFriendsAtoms } from "@/store/anilist.store";
import { useCell } from "@hullperse/hp_utils/react";
import { buildAniListSource } from "@/routes/components/anilist/source.anilist";
import { ALL_LISTS_ID, activeListEntries } from "@/lib/anilist/anilistGroup.utils";
import { hasAnyFavourites, isLocalSearch, pickDisplayEntries, routePeople } from "@/lib/anilist/anilistRoute.utils";
import { filterEntries, sortEntries } from "@/lib/anilist/entries.utils";
import type { LocalMediaFilter } from "@/lib/anilist/entries.utils";
import type { EntryLookup } from "@/types/anilist/entries";
import type { FriendSourceData } from "@/types/search/source.anilist";
import type {
  AniFriend,
  AniListCollection,
  AniListFilters,
  AniListSort,
  AniMedia,
  AniListSource,
  AnilistRouteData,
  AniUser,
  FavouriteAnime,
  GlobalSort,
} from "@/types/anilist/anilist";

export function useAnilistIdentity({
  data,
  lists,
  favourites,
}: {
  data: AnilistRouteData | undefined;
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
}) {
  const people = routePeople(data);
  const friends = useCell(anilistFriendsAtoms.friends);

  const favouriteIds = useMemo(() => new Set(favourites.map((item) => item.id)), [favourites]);
  const favouriteStaffIds = useMemo(() => new Set(people.staff.map((item) => item.id)), [people]);
  const favouriteCharacterIds = useMemo(
    () => new Set(people.characters.map((item) => item.id)),
    [people]
  );
  const friendIds = useMemo(() => [...new Set(friends.map((friend) => friend.id))], [friends]);
  const allAnimeIds = useMemo(
    () => lists.flatMap((list) => list.entries.map((entry) => entry.media.id)),
    [lists]
  );
  const listIds = useMemo(
    () => [ALL_LISTS_ID, ...lists.filter((list) => list.entries.length > 0).map((list) => list.name)],
    [lists]
  );
  const hasFavourites = hasAnyFavourites(favourites, people);

  return {
    people,
    friends,
    favouriteIds,
    favouriteStaffIds,
    favouriteCharacterIds,
    friendIds,
    allAnimeIds,
    listIds,
    hasFavourites,
  };
}

export function useAnilistSource({
  user,
  lists,
  favourites,
  entryLookup,
  favouriteIds,
  friend,
  friendData,
}: {
  user: AniUser | null;
  lists: AniListCollection[];
  favourites: FavouriteAnime[];
  entryLookup: EntryLookup;
  favouriteIds: Set<number>;
  friend: AniFriend | null;
  friendData: FriendSourceData | null;
}): AniListSource {
  return useMemo(
    () =>
      buildAniListSource({
        user,
        lists,
        favourites,
        entryLookup,
        favouriteIds,
        friend,
        friendData,
      }),
    [user, lists, favourites, entryLookup, favouriteIds, friend, friendData]
  );
}

export function useAnilistEntries({
  lists,
  currentList,
  sort,
  searchTerms,
  filterTerms,
  global,
  filters,
  localFilter,
  searchResults,
  globalSort,
}: {
  lists: AniListCollection[];
  currentList: string;
  sort: AniListSort;
  searchTerms: string;
  filterTerms: string;
  global: boolean;
  filters?: AniListFilters;
  localFilter: LocalMediaFilter | null;
  searchResults: AniMedia[];
  globalSort: GlobalSort;
}) {
  const activeEntries = useMemo(
    () => activeListEntries(lists, currentList),
    [lists, currentList]
  );
  const filteredEntries = useMemo(
    () => filterEntries(activeEntries, filterTerms, global, filters, localFilter),
    [activeEntries, filterTerms, global, filters, localFilter]
  );
  const sortedEntries = useMemo(
    () => sortEntries(filteredEntries, sort.dir, sort.key),
    [filteredEntries, sort.dir, sort.key]
  );
  const displayEntries = useMemo(
    () => pickDisplayEntries(global, searchResults, sortedEntries, globalSort),
    [global, searchResults, sortedEntries, globalSort]
  );
  const isLocal = isLocalSearch(searchTerms, global);
  const localSearchActive = isLocal || localFilter !== null;

  return { activeEntries, filteredEntries, displayEntries, isLocal, localSearchActive };
}
