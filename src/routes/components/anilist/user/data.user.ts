import { useQuery } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import { NO_FAVOURITES, NO_LISTS, NO_PEOPLE } from "@/config/anilist/defaults.config";
import type { AnilistRouteData } from "@/types/anilist";

export function useUserAnilistData() {
  const query = useQuery<AnilistRouteData>({
    queryKey: ["anilist_data"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const user = await anilistApi.checkAuth();
      if (!user) return { user: null, lists: [], favourites: [], people: NO_PEOPLE };
      const [lists, favourites, people] = await Promise.all([
        anilistApi.getLists(user.id),
        anilistApi.getFavourites(user.id),
        anilistApi.getFavouritePeople(user.id),
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
