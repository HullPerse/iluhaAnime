import { useCallback, useMemo } from "react";
import type { ChangeEvent } from "react";

import { useAutocomplete } from "@/hooks/autocomplete.hook";
import { enterSubmit } from "@/lib/keyboard.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import { SearchField, SearchFieldParams } from "@/types/collection";

export function useSearchField(params: SearchFieldParams): SearchField {
  const {
    scope,
    query,
    setQuery,
    history: historyParam,
    queryStats: queryStatsParam,
    suggestionStats: suggestionStatsParam,
    animeIndex: animeIndexParam,
    animeProfileId: animeProfileIdParam,
    anilistBoost,
    extraValues,
    collectionItems,
    collectionBoost,
    limit = 8,
    onSubmit,
    submitOnSelect = false,
    historyScope,
  } = params;

  const storeHistory = useSearchStore((s) => s.history);
  const storeQueryStats = useSearchStore((s) => s.queryStats);
  const storeSuggestionStats = useSearchStore((s) => s.suggestionStats);
  const storeAnimeIndex = useSearchStore((s) => s.animeIndex);
  const storeAnimeProfileId = useSearchStore((s) => s.animeProfileId);
  const anilistSuggestionBoost = useSettingsStore((s) => s.anilistSuggestionBoost);

  const history = historyParam ?? storeHistory;
  const queryStats = queryStatsParam ?? storeQueryStats;
  const suggestionStats = suggestionStatsParam ?? storeSuggestionStats;
  const animeIndex = animeIndexParam ?? storeAnimeIndex;
  const animeProfileId = animeProfileIdParam ?? storeAnimeProfileId;
  const boost = anilistBoost ?? anilistSuggestionBoost;

  const { suggestions, inlineCompletion, deferredQuery } = useAutocomplete({
    query,
    scope,
    history,
    queryStats,
    suggestionStats,
    animeIndex,
    animeProfileId,
    anilistBoost: boost,
    extraValues,
    collectionItems,
    collectionBoost,
    limit,
  });

  const addQuery = useSearchStore((s) => s.addQuery);
  const recordSuggestion = useSearchStore((s) => s.recordSuggestion);
  const recordSuggestionIgnored = useSearchStore((s) => s.recordSuggestionIgnored);
  const removeQuery = useSearchStore((s) => s.removeQuery);

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (inlineCompletion && trimmed.toLocaleLowerCase() !== inlineCompletion.toLocaleLowerCase()) {
      recordSuggestionIgnored(inlineCompletion);
    }
    addQuery(trimmed, historyScope ?? scope);
    onSubmit?.(trimmed);
  }, [query, inlineCompletion, recordSuggestionIgnored, addQuery, historyScope, scope, onSubmit]);

  const handleSelect = useCallback(
    (value: string) => {
      recordSuggestion(value);
      setQuery(value);
      if (submitOnSelect) {
        const trimmed = value.trim();
        if (trimmed) {
          addQuery(trimmed, historyScope ?? scope);
          onSubmit?.(trimmed);
        }
      }
    },
    [recordSuggestion, setQuery, submitOnSelect, addQuery, historyScope, scope, onSubmit]
  );

  const handleAcceptCompletion = useCallback(
    (value: string) => {
      recordSuggestion(value);
      setQuery(value);
    },
    [recordSuggestion, setQuery]
  );

  const handleDismissCompletion = useCallback(() => {
    if (inlineCompletion) recordSuggestionIgnored(inlineCompletion);
  }, [inlineCompletion, recordSuggestionIgnored]);

  const inputProps = useMemo(
    () => ({
      value: query,
      completion: inlineCompletion,
      suggestions,
      history,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
      onAcceptCompletion: handleAcceptCompletion,
      onDismissCompletion: handleDismissCompletion,
      onSelectSuggestion: handleSelect,
      onRemoveHistory: removeQuery,
      onKeyDown: enterSubmit(handleSubmit),
    }),
    [
      query,
      inlineCompletion,
      suggestions,
      history,
      setQuery,
      handleAcceptCompletion,
      handleDismissCompletion,
      handleSelect,
      removeQuery,
      handleSubmit,
    ]
  );

  return {
    suggestions,
    inlineCompletion,
    deferredQuery,
    history,
    removeQuery,
    recordSuggestion,
    recordSuggestionIgnored,
    addQuery,
    handleSubmit,
    handleSelect,
    handleAcceptCompletion,
    handleDismissCompletion,
    inputProps,
  };
}
