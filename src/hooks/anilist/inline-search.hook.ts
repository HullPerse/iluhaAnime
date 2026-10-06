import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useDebounce } from "@/hooks/debounce.hook";
import { searchFiltersToParams } from "@/lib/anilist/entries.utils";
import { defaultAniListFilters } from "@/lib/anilist/filters.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

export const INLINE_SEARCH_MIN_CHARS = 2;
export const INLINE_SEARCH_DEBOUNCE_MS = 250;
const INLINE_SEARCH_PER_PAGE = 8;

// Cache key includes adult flag so toggling drops stale results.
export function useAnimeInlineSearch(query: string, enabled = true) {
  const debounced = useDebounce(query.trim(), INLINE_SEARCH_DEBOUNCE_MS);
  const adultContent = useSettingsStore((state) => state.anilistAdultContent);
  const active = enabled && debounced.length >= INLINE_SEARCH_MIN_CHARS;
  const search = useAppQuery<AniMedia[]>("live", {
    queryKey: queryKeys.animeInlineSearch(debounced, adultContent),
    queryFn: () =>
      anilistApi.search<AniMedia>(
        searchFiltersToParams(
          defaultAniListFilters(adultContent),
          debounced,
          INLINE_SEARCH_PER_PAGE,
          1
        )
      ),
    enabled: active,
  });
  return {
    options: active ? (search.data ?? []) : [],
    loading: active && search.isFetching,
    error: search.isError,
  };
}
