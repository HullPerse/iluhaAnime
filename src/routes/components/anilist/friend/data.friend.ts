import { useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import { hasFreshCachedProfile } from "@/lib/core/anilist/friends.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type {
  AniFriend,
  AniFriendBundle,
  AniListCollection,
  FavouriteAnime,
} from "@/types/anilist/anilist";

const EMPTY_LISTS: AniListCollection[] = [];
const EMPTY_FAVOURITES: FavouriteAnime[] = [];

export function useFriendAnilistData(friend: AniFriend | null) {
  const id = friend?.id ?? null;
  const cachedProfile = hasFreshCachedProfile(friend ?? undefined) ? friend?.profile : undefined;

  const query = useAppQuery<AniFriendBundle>("slow", {
    queryKey: queryKeys.friendBundle(id),
    enabled: id != null,
    staleTime: PROFILE_CACHE_TTL_MS,
    retry: 1,
    placeholderData: cachedProfile
      ? { profile: cachedProfile, lists: EMPTY_LISTS, favourites: EMPTY_FAVOURITES }
      : undefined,
    queryFn: () => anilistApi.getFriendBundle(id as number),
  });

  const lists = query.data?.lists ?? EMPTY_LISTS;
  const favourites = query.data?.favourites ?? EMPTY_FAVOURITES;
  const entryLookup = useMemo(() => buildEntryLookup(lists), [lists]);
  const displayFavouriteIds = useMemo(
    () => new Set(favourites.map((item) => item.id)),
    [favourites]
  );

  return {
    displayFavouriteIds,
    entryLookup,
    error: query.error,
    favourites,
    isError: query.isError,
    isLoading: id != null && (query.isLoading || query.isPlaceholderData),
    lists,
    profile: query.data?.profile ?? cachedProfile ?? null,
  };
}
