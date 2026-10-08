import { useCallback, useMemo } from "react";
import type { ChangeEvent } from "react";

import { useAutocomplete } from "@/hooks/search/autocomplete.hook";
import { useSpellCheck, useSpellCorrections } from "@/hooks/search/spellcheck.hook";
import { useCell } from "@/lib/state/signal.hook";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import {
  addSearchQuery as addQuery,
  addSpellWord,
  recordSearchSuggestion as recordSuggestion,
  recordSearchSuggestionIgnored as recordSuggestionIgnored,
  removeSearchQuery as removeQuery,
  searchAtoms,
} from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
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

  const storeHistory = useCell(searchAtoms.history);
  const storeQueryStats = useCell(searchAtoms.queryStats);
  const storeSuggestionStats = useCell(searchAtoms.suggestionStats);
  const storeAnimeIndex = useCell(searchAtoms.animeIndex);
  const storeAnimeProfileId = useCell(searchAtoms.animeProfileId);
  const anilistSuggestionBoost = useCell(settingsAtoms.anilistSuggestionBoost);

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
  const spellCorrections = useSpellCorrections(query, { history, animeIndex, extraValues });
  const applySpellCorrection = useCallback(() => {
    if (!spellCheck) return;
    setQuery(spellCheck.correction);
  }, [spellCheck, setQuery]);
  const addWordToDictionary = useCallback(() => {
    if (!spellCheck) return;
    addSpellWord(spellCheck.word);
  }, [spellCheck]);

  const learningScope = historyScope ?? scope;

  const recordSelect = useCallback(
    (value: string) => recordSuggestion(value, learningScope),
    [learningScope]
  );
  const applySpellCorrectionAt = useCallback(
    (correction: string) => {
      const trimmed = correction.trim();
      if (!trimmed) return;
      recordSelect(trimmed);
      setQuery(trimmed);
    },
    [recordSelect, setQuery]
  );
  const recordIgnore = useCallback(
    (value: string) => recordSuggestionIgnored(value, learningScope),
    [learningScope]
  );
  const handleRemoveQuery = useCallback(
    (value: string) => removeQuery(value, learningScope),
    [learningScope]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (inlineCompletion && trimmed.toLocaleLowerCase() !== inlineCompletion.toLocaleLowerCase()) {
      recordIgnore(inlineCompletion);
    }
    addQuery(trimmed, historyScope ?? scope);
    onSubmit?.(trimmed);
  }, [query, inlineCompletion, recordIgnore, historyScope, scope, onSubmit]);

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
    [recordSelect, setQuery, submitOnSelect, historyScope, scope, onSubmit]
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

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    [setQuery]
  );
  const handleKeyDown = useMemo(() => enterSubmit(handleSubmit), [handleSubmit]);

  const inputProps = useMemo(
    () => ({
      value: query,
      completion: inlineCompletion,
      suggestions,
      history,
      spellCheck,
      spellCorrections,
      onApplySpellCorrection: applySpellCorrection,
      onApplySpellCorrectionAt: applySpellCorrectionAt,
      onAddWordToDictionary: addWordToDictionary,
      historyStats: queryStats,
      onChange: handleChange,
      onAcceptCompletion: handleAcceptCompletion,
      onDismissCompletion: handleDismissCompletion,
      onSelectSuggestion: handleSelect,
      onRemoveHistory: handleRemoveQuery,
      onKeyDown: handleKeyDown,
    }),
    [
      query,
      inlineCompletion,
      suggestions,
      history,
      queryStats,
      spellCheck,
      spellCorrections,
      applySpellCorrection,
      applySpellCorrectionAt,
      addWordToDictionary,
      handleChange,
      handleAcceptCompletion,
      handleDismissCompletion,
      handleSelect,
      handleRemoveQuery,
      handleKeyDown,
    ]
  );

  return useMemo(
    () => ({
      suggestions,
      inlineCompletion,
      deferredQuery,
      history,
      removeQuery: handleRemoveQuery,
      recordSuggestion: recordSelect,
      recordSuggestionIgnored: recordIgnore,
      spellCheck,
      spellCorrections,
      applySpellCorrection,
      applySpellCorrectionAt,
      addWordToDictionary,
      addQuery,
      handleSubmit,
      handleSelect,
      handleAcceptCompletion,
      handleDismissCompletion,
      inputProps,
    }),
    [
      suggestions,
      inlineCompletion,
      deferredQuery,
      history,
      handleRemoveQuery,
      recordSelect,
      recordIgnore,
      spellCheck,
      spellCorrections,
      applySpellCorrection,
      applySpellCorrectionAt,
      addWordToDictionary,
      handleSubmit,
      handleSelect,
      handleAcceptCompletion,
      handleDismissCompletion,
      inputProps,
    ]
  );
}
