import { useEffect, useRef, useState } from "react";

import { collectionApi } from "@/api/collection.api";
import { SEARCH_RANKING } from "@/config/search/ranking.config";
import { fuzzyMatchScore } from "@/lib/search/suggestions.utils";
import type { SearchSuggestion, SearchSuggestionKind } from "@/lib/search/suggestions.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import type { SearchSuggestionScope } from "@/types/search";

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
  const requestRef = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setSuggestions([]);
      return;
    }
    requestRef.current += 1;
    const requestId = requestRef.current;
    const timer = window.setTimeout(() => {
      (async () => {
        const [rows, error] = await attempt(
          collectionApi.searchUnifiedIndex(normalized, scope, limit)
        );
        if (requestRef.current !== requestId) return;
        if (error) {
          setSuggestions([]);
          return;
        }
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
      })();
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [limit, query, scope]);

  return suggestions;
}
