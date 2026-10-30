import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { searchFiltersToParams } from "@/lib/entries.utils";
import { defaultAniListFilters } from "@/lib/anilistFilters.utils";
import { queryKeys } from "@/lib/keys.utils";
import { useCell } from "@/lib/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const INLINE_SEARCH_MIN_CHARS = 2;
const INLINE_SEARCH_DEBOUNCE_MS = 250;
const INLINE_SEARCH_PER_PAGE = 8;

export function useAnimeInlineSearch(query: string, enabled = true) {
  const [debounced] = useDebouncedValue(query.trim(), { wait: INLINE_SEARCH_DEBOUNCE_MS });
  const adultContent = useCell(settingsAtoms.anilistAdultContent);
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
