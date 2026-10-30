import { useCallback } from "react";

import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/keys.utils";
import { ignore } from "@/lib/promise.utils";
import type { AniListStatistics } from "@/types/anilist";

function messageOf(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}

export function useAnilistStatistics(userId: number | null) {
  const query = useAppQuery<AniListStatistics>("slow", {
    queryKey: queryKeys.anilistStatistics(userId),
    enabled: userId != null,
    queryFn: () => anilistApi.getStatistics(userId ?? 0),
  });
  const retry = useCallback(() => {
    ignore(query.refetch());
  }, [query]);
  return {
    statistics: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: messageOf(query.error),
    updatedAt: query.dataUpdatedAt,
    retry,
  };
}
