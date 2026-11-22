import { useCallback } from "react";

import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { AniFriendBundle } from "@/types/anilist/anilist";

function messageOf(error: unknown): string | null {
  if (error == null) return null;

  return error instanceof Error ? error.message : String(error);
}

export function useFriendCompare(friendId: number | null, enabled: boolean) {
  const query = useAppQuery<AniFriendBundle>("slow", {
    queryKey: queryKeys.friendBundle(friendId),
    enabled: enabled && friendId != null,
    retry: 1,
    queryFn: () => anilistApi.getFriendBundle(friendId as number),
  });
  const retry = useCallback(() => {
    ignore(query.refetch());
  }, [query]);

  return {
    friendLists: query.data?.lists ?? [],
    friendFavourites: query.data?.favourites ?? [],
    listsLoading: query.isLoading,
    listsError: messageOf(query.error),
    retry,
  };
}
