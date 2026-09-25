import { useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { hasFreshCachedProfile } from "@/lib/anilist/friends.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniFriend, AniListCollection, AniUserProfile, FavouriteAnime } from "@/types/anilist";

const EMPTY_LISTS: AniListCollection[] = [];
const EMPTY_FAVOURITES: FavouriteAnime[] = [];

export function useFriendAnilistData(friend: AniFriend | null) {
  const id = friend?.id ?? null;

  const listsQuery = useAppQuery<AniListCollection[]>("slow", {
    queryKey: queryKeys.friendLists(id),
    enabled: id != null,
    queryFn: () => anilistApi.getLists(id as number),
  });

  const favouritesQuery = useAppQuery<FavouriteAnime[]>("slow", {
    queryKey: queryKeys.friendFavourites(id),
    enabled: id != null,
    queryFn: () => anilistApi.getFavourites(id as number),
  });

  const profileQuery = useAppQuery<AniUserProfile>("slow", {
    queryKey: queryKeys.friendProfile(id),
    enabled: id != null,
    staleTime: PROFILE_CACHE_TTL_MS,
    retry: 1,
    initialData: hasFreshCachedProfile(friend ?? undefined) ? friend?.profile : undefined,
    queryFn: () => anilistApi.getProfile(id as number),
  });

  const lists = listsQuery.data ?? EMPTY_LISTS;
  const favourites = favouritesQuery.data ?? EMPTY_FAVOURITES;
  const entryLookup = useMemo(() => buildEntryLookup(lists), [lists]);
  const displayFavouriteIds = useMemo(
    () => new Set(favourites.map((item) => item.id)),
    [favourites]
  );

  return {
    displayFavouriteIds,
    entryLookup,
    error: listsQuery.error,
    favourites,
    isError: listsQuery.isError,
    isLoading: id != null && listsQuery.isLoading,
    lists,
    profile: profileQuery.data ?? null,
  };
}
