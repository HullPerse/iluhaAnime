import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { hasFreshCachedProfile } from "@/lib/anilist/friends.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniFriend, AniListCollection, AniUserProfile, FavouriteAnime } from "@/types/anilist";

const EMPTY_LISTS: AniListCollection[] = [];
const EMPTY_FAVOURITES: FavouriteAnime[] = [];

function proxyArgs() {
  return anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl);
}

export function useFriendAnilistData(friend: AniFriend | null) {
  const id = friend?.id ?? null;

  const listsQuery = useQuery<AniListCollection[]>({
    queryKey: ["anilist_friend_lists", id],
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      invokeTyped<AniListCollection[]>("get_anilist_lists", {
        userId: id as number,
        ...proxyArgs(),
      }),
  });

  const favouritesQuery = useQuery<FavouriteAnime[]>({
    queryKey: ["anilist_friend_favourites", id],
    enabled: id != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      invokeTyped<FavouriteAnime[]>("get_favourites", {
        userId: id as number,
        ...proxyArgs(),
      }),
  });

  const profileQuery = useQuery<AniUserProfile>({
    queryKey: ["anilist_friend_profile", id],
    enabled: id != null,
    staleTime: PROFILE_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: 1,
    initialData: hasFreshCachedProfile(friend ?? undefined) ? friend?.profile : undefined,
    queryFn: () =>
      invokeTyped<AniUserProfile>("get_anilist_profile", {
        userId: id as number,
        ...proxyArgs(),
      }),
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
