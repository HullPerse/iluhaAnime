import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";

/**
 * Whether AniList has a session, without asking for the viewer's lists.
 *
 * The full AniList data query (`useUserAnilistData`) fetches lists and
 * favourites, which a place that only needs to decide whether to show a
 * sign-in bound control has no use for. The answer is cached like the rest of
 * the AniList queries, so opening several titles costs one request.
 */
export function useAnilistSignedIn(): boolean {
  const query = useAppQuery<boolean>("static", {
    queryKey: queryKeys.anilistSession(),
    queryFn: async () => (await anilistApi.checkAuth()) !== null,
  });
  return query.data === true;
}
