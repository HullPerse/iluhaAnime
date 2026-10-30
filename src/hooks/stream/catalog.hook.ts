// Streaming catalog queries.
//
// Everything the AnimeLib source returns is server state, so it lives in the
// query cache and not in a signal store: pagination, cancellation and stale
// results come for free, and a slow episode never overwrites a newer one.

import { anilistApi } from "@/api/anilist.api";
import { streamApi } from "@/api/stream.api";
import { streamFiltersKey } from "@/config/stream/filters.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { anilistEpisodePreviews } from "@/lib/stream/episodes.utils";
import type { StreamCatalogFilters } from "@/types/stream";

/** Search results, or the site's browse list when the query is empty. */
export function useStreamSearch(query: string, page: number, filters: StreamCatalogFilters) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamSearch(query, page, streamFiltersKey(filters)),
    queryFn: () => streamApi.search(query, page, filters),
    placeholderData: (previous) => previous,
  });
}

/** The catalog filter options; the Rust side keeps them for twenty minutes. */
export function useStreamConstants(enabled: boolean) {
  return useAppQuery("static", {
    queryKey: queryKeys.streamConstants(),
    queryFn: () => streamApi.constants(),
    enabled,
  });
}

/** A title and its episode list: one query, one IPC round trip. */
export function useStreamTitle(slug: string | null) {
  return useAppQuery("static", {
    queryKey: queryKeys.streamTitle(slug ?? ""),
    queryFn: () => streamApi.title(slug ?? ""),
    enabled: slug !== null && slug.length > 0,
  });
}

/**
 * Episode previews of the title AniList matched, keyed by episode number. A
 * title without an AniList id simply has no previews, which is not an error.
 */
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

/**
 * The locally remembered episodes of one title. The player writes these rows,
 * so the modal can mark watched episodes and preselect the last one without a
 * network round trip.
 */
export function useStreamHistoryForAnime(animeId: string | null) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamHistoryForAnime(animeId ?? ""),
    queryFn: () => streamApi.historyForAnime(animeId ?? ""),
    enabled: animeId !== null && animeId.length > 0,
  });
}

/** The newest remembered episodes across titles, for the history modal. */
export function useStreamHistoryRecent(open: boolean) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamHistoryRecent(),
    queryFn: () => streamApi.historyRecent(50),
    enabled: open,
  });
}

/** Watched count and the newest episode of one title, for a hover badge. */
export function useStreamHistoryProgress(animeId: string, enabled: boolean) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamHistoryProgress(animeId),
    queryFn: () => streamApi.historyProgress(animeId),
    enabled: enabled && animeId.length > 0,
  });
}

/** The voice-overs an episode offers. */
export function useStreamPlayers(episodeId: string | null) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamPlayers(episodeId ?? ""),
    queryFn: () => streamApi.players(episodeId ?? ""),
    enabled: episodeId !== null && episodeId.length > 0,
  });
}

/** The playable sources of one voice-over, best quality first. */
export function useStreamSources(episodeId: string | null, variantId: string | null) {
  return useAppQuery("slow", {
    queryKey: queryKeys.streamSources(episodeId ?? "", variantId ?? ""),
    queryFn: () =>
      streamApi.streamSources({
        episodeId: episodeId ?? "",
        variantId: variantId ?? "",
      }),
    enabled:
      episodeId !== null && episodeId.length > 0 && variantId !== null && variantId.length > 0,
  });
}
