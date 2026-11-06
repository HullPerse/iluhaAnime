import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { anilistApi } from "@/api/anilist.api";
import { streamApi } from "@/api/stream.api";
import { QUERY_PRESETS } from "@/config/system/query.config";
import { streamFiltersKey } from "@/config/player/streamFilters.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { anilistEpisodePreviews } from "@/lib/player/episodes.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { StreamCatalogFilters } from "@/types/player/stream";

export function useStreamSearch(query: string, page: number, filters: StreamCatalogFilters) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamSearch(query, page, streamFiltersKey(filters)),
    queryFn: () => streamApi.search(query, page, filters),
    placeholderData: (previous) => previous,
  });
}

const streamConstantsOptions = {
  queryKey: queryKeys.streamConstants(),
  queryFn: () => streamApi.constants(),
};

export function useStreamConstants(enabled: boolean) {
  return useAppQuery("static", { ...streamConstantsOptions, enabled });
}

export function prefetchStreamConstants(queryClient: QueryClient): Promise<void> {
  return queryClient
    .prefetchQuery({ ...QUERY_PRESETS.static, ...streamConstantsOptions })
    .then(() => undefined);
}

export function useStreamTitle(slug: string | null) {
  return useAppQuery("static", {
    queryKey: queryKeys.streamTitle(slug ?? ""),
    queryFn: () => streamApi.title(slug ?? ""),
    enabled: slug !== null && slug.length > 0,
  });
}

export function useAnilistEpisodePreviews(anilistId: number | null | undefined) {
  const query = useAppQuery("static", {
    queryKey: queryKeys.anilistEpisodePreviews(anilistId ?? 0),
    queryFn: () =>
      anilistApi
        .getStreamingEpisodes(anilistId ?? 0)
        .then((episodes) => anilistEpisodePreviews(episodes)),
    enabled: typeof anilistId === "number" && anilistId > 0,
  });
  return query.data ?? new Map<number, string>();
}

export function useStreamHistoryForAnime(animeId: string | null) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamHistoryForAnime(animeId ?? ""),
    queryFn: () => streamApi.historyForAnime(animeId ?? ""),
    enabled: animeId !== null && animeId.length > 0,
  });
}

const streamHistoryRecentOptions = {
  queryKey: queryKeys.streamHistoryRecent(),
  queryFn: () => streamApi.historyRecent(50),
};

export function useStreamHistoryRecent(open: boolean) {
  return useAppQuery("slow", { ...streamHistoryRecentOptions, enabled: open });
}

export function usePrewarmStreamHistory(ready: boolean): void {
  const queryClient = useQueryClient();
  const enabled = useCell(settingsAtoms.streamTabEnabled);
  useEffect(() => {
    if (!ready || !enabled) return;
    ignore(queryClient.prefetchQuery({ ...QUERY_PRESETS.slow, ...streamHistoryRecentOptions }));
  }, [enabled, queryClient, ready]);
}

export function useStreamHistoryProgress(animeId: string, enabled: boolean) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamHistoryProgress(animeId),
    queryFn: () => streamApi.historyProgress(animeId),
    enabled: enabled && animeId.length > 0,
  });
}
