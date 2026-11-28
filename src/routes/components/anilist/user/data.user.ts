import { useEffect, useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { NO_FAVOURITES, NO_LISTS, NO_PEOPLE } from "@/config/anilist/anilistDefaults.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { syncCoverModeWithAnilistAuth } from "@/store/settings.store";
import type { AnilistRouteData } from "@/types/anilist/anilist";

export function useUserAnilistData(options: { enabled?: boolean; manga?: boolean } = {}) {
  const query = useAppQuery<AnilistRouteData>("slow", {
    queryKey: queryKeys.anilistData(),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const bundle = await anilistApi.getBootstrap();

      if (!bundle) return { user: null, lists: [], favourites: [], people: NO_PEOPLE };

      return {
        user: bundle.user,
        lists: bundle.lists,
        favourites: bundle.favourites.anime,
        people: bundle.favourites.people,
      };
    },
  });
  const userId = query.data?.user?.id;
  const mangaLists = useAppQuery("slow", {
    queryKey: [...queryKeys.anilistData(), "MANGA", "lists", userId],
    enabled: (options.enabled ?? true) && userId !== undefined,
    queryFn: () => anilistApi.getLists(userId ?? 0, false, "MANGA"),
  });
  const overview = useAppQuery("slow", {
    queryKey: [...queryKeys.anilistData(), "MANGA", "overview", userId],
    enabled: (options.enabled ?? true) && userId !== undefined,
    queryFn: () => anilistApi.getMangaOverview(userId ?? 0),
  });
  const data = useMemo(() => {
    const base = query.data;

    if (!base || !options.manga) return base;
    const lists = mangaLists.data ?? NO_LISTS;
    const entries = lists.flatMap((list) => list.entries);
    const statistics = overview.data?.statistics;

    return {
      ...base,
      user: base.user
        ? {
            ...base.user,
            anime_count: statistics?.count ?? entries.length,
            episodes_watched:
              statistics?.chapters ??
              entries.reduce((sum, entry) => sum + (entry.progress ?? 0), 0),
            mean_score: statistics?.meanScore ?? null,
          }
        : null,
      lists,
      favourites:
        overview.data?.favourites.map((media) => ({
          id: media.id,
          title: { romaji: media.title, english: null },
          cover_image: { medium: media.cover_url },
          mean_score: media.score,
          format: media.format,
        })) ?? NO_FAVOURITES,
    };
  }, [query.data, options.manga, mangaLists.data, overview.data]);

  return {
    data,
    isLoading: query.isLoading,
    isListLoading: options.manga ? mangaLists.isFetching : query.isFetching,
    lists: data?.lists ?? NO_LISTS,
    favourites: data?.favourites ?? NO_FAVOURITES,
    user: data?.user ?? null,
  };
}

export function useAnilistCoverModeSync(): void {
  const { isLoading, user } = useUserAnilistData();
  useEffect(() => {
    if (isLoading) return;
    syncCoverModeWithAnilistAuth(user !== null);
  }, [isLoading, user]);
}
