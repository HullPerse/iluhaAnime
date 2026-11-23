import { useCell } from "@hullperse/hp_utils/react";
import { anilistMangaMode } from "@/store/anilistManga.store";
import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { AniListStatistics } from "@/types/anilist/anilist";

function messageOf(error: unknown): string | null {
  if (error == null) return null;

  return error instanceof Error ? error.message : String(error);
}

export function prefetchAnilistStatistics(queryClient: QueryClient, userId: number): void {
  ignore(
    queryClient.prefetchQuery({
      queryKey: queryKeys.anilistStatistics(userId),
      queryFn: () => anilistApi.getStatistics(userId),
      staleTime: 5 * 60 * 1000,
    })
  );
}

export function useAnilistStatistics(userId: number | null) {
  const manga = useCell(anilistMangaMode);
  const query = useAppQuery<AniListStatistics>("slow", {
    queryKey: [...queryKeys.anilistStatistics(userId), manga],
    enabled: userId != null,
    queryFn: () => anilistApi.getStatistics(userId ?? 0, manga ? "MANGA" : "ANIME"),
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
