import { useEffect } from "react";

import { anilistApi } from "@/api/anilist.api";
import { NO_FAVOURITES, NO_LISTS, NO_PEOPLE } from "@/config/anilist/anilistDefaults.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { syncCoverModeWithAnilistAuth } from "@/store/settings.store";
import type { AnilistRouteData } from "@/types/anilist/anilist";

export function useUserAnilistData(options: { enabled?: boolean } = {}) {
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
    placeholderData: (previous) => previous,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    lists: query.data?.lists ?? NO_LISTS,
    favourites: query.data?.favourites ?? NO_FAVOURITES,
    user: query.data?.user ?? null,
  };
}

/**
 * The cover mode is automatic unless the user picked one, so it has to follow
 * the saved AniList session on startup too, not only login/logout events.
 */
export function useAnilistCoverModeSync(): void {
  const { isLoading, user } = useUserAnilistData();
  useEffect(() => {
    if (isLoading) return;
    syncCoverModeWithAnilistAuth(user !== null);
  }, [isLoading, user]);
}
