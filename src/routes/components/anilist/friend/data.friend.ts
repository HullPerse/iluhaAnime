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

export function useFriendAnilistData(friend: AniFriend | null, manga = false) {
  const id = friend?.id ?? null;
  const cachedProfile = hasFreshCachedProfile(friend ?? undefined) ? friend?.profile : undefined;

  const query = useAppQuery<AniFriendBundle>("slow", {
    queryKey: manga ? [...queryKeys.friendBundle(id), "MANGA"] : queryKeys.friendBundle(id),
    enabled: id != null,
    staleTime: PROFILE_CACHE_TTL_MS,
    retry: 1,
    placeholderData: cachedProfile
      ? { profile: cachedProfile, lists: EMPTY_LISTS, favourites: EMPTY_FAVOURITES }
      : undefined,
    queryFn: async () => {
      const bundle = await anilistApi.getFriendBundle(id as number);

      if (!manga) return bundle;
      const [lists, overview] = await Promise.all([
        anilistApi.getLists(id as number, false, "MANGA"),
        anilistApi.getMangaOverview(id as number),
      ]);

      return {
        profile: {
          ...bundle.profile,
          anime_count: overview.statistics.count,
          episodes_watched: overview.statistics.chapters,
          mean_score: overview.statistics.meanScore,
        },
        lists,
        favourites: overview.favourites.map((media) => ({
          id: media.id,
          title: { romaji: media.title, english: null },
          cover_image: { medium: media.cover_url },
          mean_score: media.score,
          format: media.format,
        })),
      };
    },
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
