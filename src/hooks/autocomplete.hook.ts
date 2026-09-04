import { useDeferredValue, useMemo } from "react";

import { useSemanticSuggestions } from "@/hooks/semantic.hook";
import { useSuggestions } from "@/hooks/suggestion.hook";
import { getInlineCompletion, getSearchSuggestions } from "@/lib/search.suggestions";
import { useSettingsStore } from "@/store/settings.store";
import type { SearchSuggestionOptions } from "@/types/search";
import type { SearchSuggestionScope } from "@/types/search";

type Params = {
  query: string;
  scope: SearchSuggestionScope;
  history?: string[];
  queryStats?: SearchSuggestionOptions["queryStats"];
  suggestionStats?: SearchSuggestionOptions["suggestionStats"];
  animeIndex?: SearchSuggestionOptions["animeIndex"];
  animeProfileId?: number | null;
  anilistBoost?: SearchSuggestionOptions["anilistBoost"];
  extraValues?: SearchSuggestionOptions["extraValues"];
  collectionItems?: SearchSuggestionOptions["collectionItems"];
  collectionBoost?: number;
  limit?: number;
};

export function useAutocomplete(params: Params) {
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
  const semanticEnabled = useSettingsStore((s) => s.searchSemanticEnabled);
  const semanticSuggestions = useSemanticSuggestions(deferredQuery, semanticEnabled, limit);

  const mergedBackend = useMemo(() => {
    if (semanticSuggestions.length === 0) return backendSuggestions;
    // merge semantic with lower score
    const map = new Map<string, (typeof backendSuggestions)[number]>();
    for (const s of backendSuggestions) map.set(s.value, s);
    for (const s of semanticSuggestions) {
      if (!map.has(s.value)) map.set(s.value, { ...s, score: s.score * 0.8 } as never);
    }
    return [...map.values()];
  }, [backendSuggestions, semanticSuggestions]);

  const suggestions = useMemo(
    () =>
      getSearchSuggestions(deferredQuery, {
        animeEnabled: animeProfileId != null,
        animeIndex,
        anilistBoost,
        backendSuggestions: mergedBackend,
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
      mergedBackend,
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
