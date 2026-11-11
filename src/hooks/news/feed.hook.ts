import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useCell } from "@hullperse/hp_utils/react";

import { newsApi } from "@/api/news.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { settingsAtoms } from "@/store/settings.store";

const NEWS_STALE_MS = 10 * 60 * 1000;
const NEWS_GC_MS = 30 * 60 * 1000;

/** One page of the Shikimori news feed, cached for ten minutes with a manual refresh. */
export function useNewsFeed(page: number) {
  const proxyUrl = useCell(settingsAtoms.newsProxyUrl) ?? "";
  const queryClient = useQueryClient();

  const query = useAppQuery("slow", {
    queryKey: queryKeys.newsFeed(page, proxyUrl),
    queryFn: () => newsApi.feed(page, proxyUrl || null),
    staleTime: NEWS_STALE_MS,
    gcTime: NEWS_GC_MS,
    placeholderData: keepPreviousData,
  });

  const refresh = useCallback(() => {
    ignore(queryClient.invalidateQueries({ queryKey: ["news_feed"] }));
  }, [queryClient]);

  return {
    data: query.data ?? null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
}
