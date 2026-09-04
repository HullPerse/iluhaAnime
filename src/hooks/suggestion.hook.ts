import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

import { SEARCH_RANKING } from "@/config/searchRanking.config";
import { fuzzyMatchScore } from "@/lib/search.suggestions";
import type { SearchSuggestion, SearchSuggestionKind } from "@/lib/search.suggestions";
import type { SearchSuggestionScope, UnifiedIndexRow } from "@/types/search";

function suggestionKind(kind: string): SearchSuggestionKind {
  if (kind === "anime" || kind === "anime_alias") return "anime";
  if (kind === "torrent") return "torrent";
  if (kind === "local_file") return "local";
  return "history";
}

export function useSuggestions(
  query: string,
  scope: SearchSuggestionScope,
  limit = 8
): SearchSuggestion[] {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

  useEffect(() => {
    let disposed = false;
    const normalized = query.trim();
    if (!normalized) {
      setSuggestions([]);
      return;
    }

    invoke<UnifiedIndexRow[]>("search_unified_index", {
      query: normalized,
      scope,
      limit,
    })
      .then((rows) => {
        if (disposed) return;
        setSuggestions(
          (Array.isArray(rows) ? rows : [])
            .map((row) => {
              const match = fuzzyMatchScore(normalized, row.value) ?? 0;
              const learning =
                Math.min(
                  SEARCH_RANKING.LEARNING_SELECTED_CAP,
                  row.selectedCount * SEARCH_RANKING.LEARNING_SELECTED_WEIGHT
                ) +
                Math.min(
                  SEARCH_RANKING.LEARNING_USE_CAP,
                  row.useCount * SEARCH_RANKING.LEARNING_USE_WEIGHT
                ) -
                Math.min(
                  SEARCH_RANKING.LEARNING_IGNORED_CAP,
                  row.ignoredCount * SEARCH_RANKING.LEARNING_IGNORED_WEIGHT
                );
              return {
                kind: suggestionKind(row.kind),
                score: match + learning,
                subtitle: row.subtitle ?? undefined,
                value: row.value,
              };
            })
            .sort((left, right) => right.score - left.score)
            .slice(0, Math.max(1, limit))
        );
      })
      .catch(() => {
        if (!disposed) setSuggestions([]);
      });

    return () => {
      disposed = true;
    };
  }, [limit, query, scope]);

  return suggestions;
}

export const useSugggestions = useSuggestions;
