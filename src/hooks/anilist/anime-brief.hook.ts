import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { QueryClient } from "@tanstack/react-query";
import type { AniMedia } from "@/types/anilist";

/**
 * One anime brief by id, shared through the `animeBrief` query cache: the
 * inline search primes it, cards read it, and a miss falls back to the
 * `fetchAnimeBrief` seam (currently the detail command, batch later).
 */
export function useAnimeBrief(id: number, initialBrief?: AniMedia | null) {
  const valid = Number.isInteger(id) && id > 0;
  const brief = useAppQuery<AniMedia>("static", {
    queryKey: queryKeys.animeBrief(id),
    queryFn: () => anilistApi.fetchAnimeBrief(id),
    enabled: valid,
    initialData: initialBrief ?? undefined,
  });
  return {
    brief: valid ? (brief.data ?? null) : null,
    loading: valid && brief.isLoading,
    error: brief.isError,
  };
}

/**
 * Prime the shared brief cache with a search result, so a later card for
 * the same id resolves without a fetch.
 */
export function primeAnimeBrief(client: QueryClient, brief: AniMedia): void {
  client.setQueryData(queryKeys.animeBrief(brief.id), brief);
}
