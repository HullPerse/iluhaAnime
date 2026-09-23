import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { hasFreshCachedProfile } from "@/lib/anilist/friends.utils";
import type { AniFriend, AniListCollection, AniUserProfile, FavouriteAnime } from "@/types/anilist";

const EMPTY_LISTS: AniListCollection[] = [];
const EMPTY_FAVOURITES: FavouriteAnime[] = [];

export function useFriendAnilistData(friend: AniFriend | null) {
  const id = friend?.id ?? null;

  const listsQuery = useQuery<AniListCollection[]>({
    queryKey: ["anilist_friend_lists", id],
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => anilistApi.getLists(id as number),
  });

  const favouritesQuery = useQuery<FavouriteAnime[]>({
    queryKey: ["anilist_friend_favourites", id],
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () => anilistApi.getFavourites(id as number),
  });

  const profileQuery = useQuery<AniUserProfile>({
    queryKey: ["anilist_friend_profile", id],
    enabled: id != null,
    staleTime: PROFILE_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
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
