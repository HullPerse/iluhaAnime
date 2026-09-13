import { useQuery } from "@tanstack/react-query";

import { NO_FAVOURITES, NO_LISTS, NO_PEOPLE } from "@/config/anilist/defaults.config";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniListCollection,
  AnilistRouteData,
  AniUser,
  FavouriteAnime,
  FavouritePeople,
} from "@/types/anilist";

export function useUserAnilistData() {
  const query = useQuery<AnilistRouteData>({
    queryKey: ["anilist_data"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const user = await invokeTyped<AniUser | null>(
        "check_anilist_auth",
        anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl)
      );
      if (!user) return { user: null, lists: [], favourites: [], people: NO_PEOPLE };
      const [lists, favourites, people] = await Promise.all([
        invokeTyped<AniListCollection[]>("get_anilist_lists", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
        invokeTyped<FavouriteAnime[]>("get_favourites", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
        invokeTyped<FavouritePeople>("get_favourite_people", {
          userId: user.id,
          ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
        }),
      ]);
      return { user, lists, favourites, people };
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
