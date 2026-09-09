import { useDeferredValue, useMemo } from "react";

import { useSuggestions } from "@/hooks/search/suggestion.hook";
import { getInlineCompletion, getSearchSuggestions } from "@/lib/search/suggestions.utils";
import type { AutocompleteParams } from "@/types/search";

export function useAutocomplete(params: AutocompleteParams) {
  const {
    query,
    scope,
    limit = 8,
    history,
    queryStats,
    suggestionStats,
    animeIndex,
    animeProfileId,
    anilistBoost,
    extraValues,
    collectionItems,
    collectionBoost,
  } = params;
  const deferredQuery = useDeferredValue(query);
  const backendSuggestions = useSuggestions(deferredQuery, scope, limit);

  const suggestions = useMemo(
    () =>
      getSearchSuggestions(deferredQuery, {
        animeEnabled: animeProfileId != null,
        animeIndex,
        anilistBoost,
        backendSuggestions,
        extraValues,
        collectionItems,
        collectionBoost,
        history,
        queryStats,
        scope,
        suggestionStats,
        limit,
      }),
    [
      deferredQuery,
      backendSuggestions,
      animeIndex,
      animeProfileId,
      anilistBoost,
      extraValues,
      collectionItems,
      collectionBoost,
      history,
      queryStats,
      scope,
      suggestionStats,
      limit,
    ]
  );

  const inlineCompletion = useMemo(
    () => getInlineCompletion(deferredQuery, suggestions),
    [deferredQuery, suggestions]
  );

  return { deferredQuery, suggestions, inlineCompletion, backendSuggestions };
}
