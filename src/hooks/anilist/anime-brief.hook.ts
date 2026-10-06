import type { QueryClient } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniMedia } from "@/types/anilist";

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

export function primeAnimeBrief(client: QueryClient, brief: AniMedia): void {
  client.setQueryData(queryKeys.animeBrief(brief.id), brief);
}
