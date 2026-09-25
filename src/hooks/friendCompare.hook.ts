import { useCallback } from "react";

import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist";

function messageOf(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}

export function useFriendCompare(friendId: number | null, enabled: boolean) {
  const listsQuery = useAppQuery<AniListCollection[]>("slow", {
    queryKey: queryKeys.friendLists(friendId),
    enabled: enabled && friendId != null,
    retry: 1,
    queryFn: () => anilistApi.getLists(friendId as number),
  });
  const favouritesQuery = useAppQuery<FavouriteAnime[]>("slow", {
    queryKey: queryKeys.friendFavourites(friendId),
    enabled: enabled && friendId != null,
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
