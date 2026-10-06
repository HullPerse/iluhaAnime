import { useCallback, useMemo } from "react";
import type { ChangeEvent } from "react";

import { useAutocomplete } from "@/hooks/search/autocomplete.hook";
import { useSpellCheck } from "@/hooks/search/spellcheck.hook";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
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

  const spellCheck = useSpellCheck(query, { history, animeIndex, extraValues });
  const applySpellCorrection = useCallback(() => {
    if (!spellCheck) return;
    setQuery(spellCheck.correction);
  }, [spellCheck, setQuery]);
  const addSpellWord = useSearchStore((s) => s.addSpellWord);
  const addWordToDictionary = useCallback(() => {
    if (!spellCheck) return;
    addSpellWord(spellCheck.word);
  }, [spellCheck, addSpellWord]);

  const addQuery = useSearchStore((s) => s.addQuery);
  const recordSuggestion = useSearchStore((s) => s.recordSuggestion);
  const recordSuggestionIgnored = useSearchStore((s) => s.recordSuggestionIgnored);
  const removeQuery = useSearchStore((s) => s.removeQuery);
  const learningScope = historyScope ?? scope;

  const recordSelect = useCallback(
    (value: string) => recordSuggestion(value, learningScope),
    [recordSuggestion, learningScope]
  );
  const recordIgnore = useCallback(
    (value: string) => recordSuggestionIgnored(value, learningScope),
    [recordSuggestionIgnored, learningScope]
  );
  const handleRemoveQuery = useCallback(
    (value: string) => removeQuery(value, learningScope),
    [removeQuery, learningScope]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (inlineCompletion && trimmed.toLocaleLowerCase() !== inlineCompletion.toLocaleLowerCase()) {
      recordIgnore(inlineCompletion);
    }
    addQuery(trimmed, historyScope ?? scope);
    onSubmit?.(trimmed);
  }, [query, inlineCompletion, recordIgnore, addQuery, historyScope, scope, onSubmit]);

  const handleSelect = useCallback(
    (value: string) => {
      recordSelect(value);
      setQuery(value);
      if (submitOnSelect) {
        const trimmed = value.trim();
        if (!trimmed) return;

        addQuery(trimmed, historyScope ?? scope);
        onSubmit?.(trimmed);
      }
    },
    [recordSelect, setQuery, submitOnSelect, addQuery, historyScope, scope, onSubmit]
  );

  const handleAcceptCompletion = useCallback(
    (value: string) => {
      recordSelect(value);
      setQuery(value);
    },
    [recordSelect, setQuery]
  );

  const handleDismissCompletion = useCallback(() => {
    if (inlineCompletion) recordIgnore(inlineCompletion);
  }, [inlineCompletion, recordIgnore]);

  const inputProps = useMemo(
    () => ({
      value: query,
      completion: inlineCompletion,
      suggestions,
      history,
      spellCheck,
      onApplySpellCorrection: applySpellCorrection,
      onAddWordToDictionary: addWordToDictionary,
      historyStats: queryStats,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
      onAcceptCompletion: handleAcceptCompletion,
      onDismissCompletion: handleDismissCompletion,
      onSelectSuggestion: handleSelect,
      onRemoveHistory: handleRemoveQuery,
      onKeyDown: enterSubmit(handleSubmit),
    }),
    [
      query,
      inlineCompletion,
      suggestions,
      history,
      queryStats,
      spellCheck,
      applySpellCorrection,
      addWordToDictionary,
      setQuery,
      handleAcceptCompletion,
      handleDismissCompletion,
      handleSelect,
      handleRemoveQuery,
      handleSubmit,
    ]
  );

  return {
    suggestions,
    inlineCompletion,
    deferredQuery,
    history,
    removeQuery: handleRemoveQuery,
    recordSuggestion: recordSelect,
    recordSuggestionIgnored: recordIgnore,
    spellCheck,
    applySpellCorrection,
    addWordToDictionary,
    addQuery,
    handleSubmit,
    handleSelect,
    handleAcceptCompletion,
    handleDismissCompletion,
    inputProps,
  };
}
