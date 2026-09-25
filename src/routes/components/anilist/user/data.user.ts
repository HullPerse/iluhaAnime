import { anilistApi } from "@/api/anilist.api";
import { NO_FAVOURITES, NO_LISTS, NO_PEOPLE } from "@/config/anilist/defaults.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AnilistRouteData } from "@/types/anilist";

export function useUserAnilistData() {
  const query = useAppQuery<AnilistRouteData>("slow", {
    queryKey: queryKeys.anilistData(),
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
