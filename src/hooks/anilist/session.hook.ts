import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";

export function useAnilistSignedIn(): boolean {
  const query = useAppQuery<boolean>("static", {
    queryKey: queryKeys.anilistSession(),
    queryFn: async () => (await anilistApi.checkAuth()) !== null,
  });
  return query.data === true;
}
