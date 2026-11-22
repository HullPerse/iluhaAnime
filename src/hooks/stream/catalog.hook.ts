import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

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
import { streamSource } from "@/store/stream.store";
import { DEFAULT_STREAM_SOURCE } from "@/config/player/streamSources.config";
import type { StreamCatalogFilters, StreamSourceId } from "@/types/player/stream";

export function useStreamSearch(query: string, page: number, filters: StreamCatalogFilters) {
  const source = useCell(streamSource);

  return useAppQuery("slow", {
    queryKey: queryKeys.streamSearch(source, query, page, streamFiltersKey(filters)),
    queryFn: () => streamApi.search(query, page, filters, source),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === source ? previous : undefined,
  });
}

function streamConstantsOptions(source: StreamSourceId) {
  return {
    queryKey: queryKeys.streamConstants(source),
    queryFn: () => streamApi.constants(source),
  };
}

export function useStreamConstants(enabled: boolean) {
  const source = useCell(streamSource);

  return useAppQuery("static", { ...streamConstantsOptions(source), enabled });
}

export function prefetchStreamConstants(
  queryClient: QueryClient,
  source: StreamSourceId = DEFAULT_STREAM_SOURCE
): Promise<void> {
  return queryClient
    .prefetchQuery({ ...QUERY_PRESETS.static, ...streamConstantsOptions(source) })
    .then(() => undefined);
}

export function useStreamTitle(slug: string | null) {
  const source = useCell(streamSource);

  return useAppQuery("static", {
    queryKey: queryKeys.streamTitle(source, slug ?? ""),
    queryFn: () => streamApi.title(slug ?? "", source),
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

function streamHistoryRecentOptions(source: StreamSourceId) {
  return {
    queryKey: queryKeys.streamHistoryRecent(source),
    queryFn: () => streamApi.historyRecent(50, source),
  };
}

export function useStreamHistoryRecent(open: boolean) {
  const source = useCell(streamSource);

  return useAppQuery("slow", { ...streamHistoryRecentOptions(source), enabled: open });
}

export function usePrewarmStreamHistory(ready: boolean): void {
  const queryClient = useQueryClient();
  const enabled = useCell(settingsAtoms.streamTabEnabled);
  const source = useCell(streamSource);

  useEffect(() => {
    if (!ready || !enabled) return;
    ignore(
      queryClient.prefetchQuery({ ...QUERY_PRESETS.slow, ...streamHistoryRecentOptions(source) })
    );
  }, [enabled, queryClient, ready, source]);
}

/** One request for the visible catalog page instead of one per hovered card. */
export function useStreamHistoryProgressMap(animeIds: string[]) {
  const idsKey = animeIds.join(",");
  const ids = useMemo(() => (idsKey.length > 0 ? idsKey.split(",") : []), [idsKey]);
  const query = useAppQuery("slow", {
    queryKey: queryKeys.streamHistoryProgressMany(idsKey),
    queryFn: () => streamApi.historyProgressMany(ids),
    enabled: ids.length > 0,
  });
  const data = query.data;

  return useMemo(() => new Map(data ? Object.entries(data) : []), [data]);
}
