import { useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useDailySearchIndex } from "@/hooks/daily/queries.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import {
  localGuessSuggestions,
  mergeSuggestions,
  suggestionFromMedia,
} from "@/lib/daily/localSearch.utils";
import { rankSuggestions, titleMatchRank } from "@/lib/daily/search.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { DailyGuessSuggestion } from "@/types/ui/daily";

const SUGGESTION_LIMIT = 6;

export function useDailyGuessSuggestions(
  query: string,
  enabled: boolean
): {
  suggestions: DailyGuessSuggestion[];
  loading: boolean;
} {
  const index = useDailySearchIndex();
  const trimmed = query.trim();
  const local = useMemo(
    () => localGuessSuggestions(index.data ?? [], trimmed, SUGGESTION_LIMIT),
    [index.data, trimmed]
  );
  const [debounced] = useDebouncedValue(trimmed, { wait: 200 });
  const proxy = effectiveProxyUrl(
    settingsAtoms.dailyProxyUrl.get(),
    settingsAtoms.anilistProxyUrl.get()
  );
  const shouldSearchRemote =
    enabled && trimmed.length >= 2 && debounced === trimmed && local.length < SUGGESTION_LIMIT;
  const remote = useAppQuery<DailyGuessSuggestion[]>("static", {
    queryKey: queryKeys.dailySearch(debounced, proxy ?? ""),
    queryFn: async () => {
      const media = await anilistApi.searchWithProxy(
        { query: debounced, perPage: 12, maxPages: 1 },
        proxy
      );
      return rankSuggestions(media, debounced)
        .filter((item) => titleMatchRank(item, debounced) > 0)
        .map((item) => suggestionFromMedia(item, debounced));
    },
    enabled: shouldSearchRemote && debounced.length >= 2,
    retry: false,
  });

  const suggestions = useMemo(
    () =>
      mergeSuggestions(local, debounced === trimmed ? (remote.data ?? []) : [], SUGGESTION_LIMIT),
    [debounced, local, remote.data, trimmed]
  );

  return {
    suggestions,
    loading: index.isPending || (shouldSearchRemote && remote.isFetching),
  };
}
