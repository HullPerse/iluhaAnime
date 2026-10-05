import { anilistApi } from "@/api/anilist.api";
import { defaultFilters } from "@/config/anilist/filters.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useDebounce } from "@/hooks/debounce.hook";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniMedia } from "@/types/anilist";

/** Minimum trimmed characters before the inline search fires. */
export const INLINE_SEARCH_MIN_CHARS = 2;
/** Keystroke debounce and results per dropdown page. */
export const INLINE_SEARCH_DEBOUNCE_MS = 250;
const INLINE_SEARCH_PER_PAGE = 8;

/**
 * Typeahead AniList search for the chat `@anime:` trigger. The debounced
 * query feeds a `live`-preset TanStack query, so repeated keystrokes reuse
 * the cache instead of hammering the backend. Adult filtering follows the
 * collection default (`defaultFilters.adult`, currently excluded).
 */
export function useAnimeInlineSearch(query: string, enabled = true) {
  const debounced = useDebounce(query.trim(), INLINE_SEARCH_DEBOUNCE_MS);
  const active = enabled && debounced.length >= INLINE_SEARCH_MIN_CHARS;
  const search = useAppQuery<AniMedia[]>("live", {
    queryKey: queryKeys.animeInlineSearch(debounced),
    queryFn: () =>
      anilistApi.search<AniMedia>(
        searchFiltersToParams(defaultFilters, debounced, INLINE_SEARCH_PER_PAGE, 1)
      ),
    enabled: active,
  });
  return {
    options: active ? (search.data ?? []) : [],
    loading: active && search.isFetching,
    error: search.isError,
  };
}
