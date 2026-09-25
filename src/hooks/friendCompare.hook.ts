import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { anilistApi } from "@/api/anilist.api";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist";

function messageOf(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}

export function useFriendCompare(friendId: number | null, enabled: boolean) {
  const listsQuery = useQuery<AniListCollection[]>({
    queryKey: ["anilist_friend_lists", friendId],
    enabled: enabled && friendId != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => anilistApi.getLists(friendId as number),
  });
  const favouritesQuery = useQuery<FavouriteAnime[]>({
    queryKey: ["anilist_friend_favourites", friendId],
    enabled: enabled && friendId != null,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => anilistApi.getFavourites(friendId as number),
  });
  const retry = useCallback(() => {
    listsQuery.refetch().catch(() => {});
    favouritesQuery.refetch().catch(() => {});
  }, [listsQuery, favouritesQuery]);
  return {
    friendLists: listsQuery.data ?? [],
    friendFavourites: favouritesQuery.data ?? [],
    listsLoading: listsQuery.isLoading,
    listsError: messageOf(listsQuery.error),
    retry,
  };
}
