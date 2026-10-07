import { useDeferredValue, useMemo } from "react";

import { useSuggestions } from "@/hooks/search/suggestion.hook";
import { getInlineCompletion, getSearchSuggestions } from "@/lib/search/suggestions.utils";
import { useCell } from "@/lib/state/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
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
  const searchSymSpellEnabled = useCell(settingsAtoms.searchSymSpellEnabled);

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
        symSpell: searchSymSpellEnabled,
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
      searchSymSpellEnabled,
    ]
  );

  const inlineCompletion = useMemo(
    () => getInlineCompletion(deferredQuery, suggestions),
    [deferredQuery, suggestions]
  );

  return { deferredQuery, suggestions, inlineCompletion, backendSuggestions };
}
