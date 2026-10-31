import { useEffect, useRef, useState } from "react";

import { collectionApi } from "@/api/collection.api";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { suggestionPoolSize, suggestionScore } from "@/lib/core/rank.utils";
import { parseOperatorTerms } from "@/lib/search/searchScore.utils";
import { matchNormalizedTitle, normalizeSearchText } from "@/lib/core/suggestions.utils";
import type { SearchSuggestion, SearchSuggestionKind } from "@/lib/core/suggestions.utils";
import { attempt } from "@/lib/core/attempt.utils";
import type { SearchSuggestionScope } from "@/types/search/search";

const SUGGESTION_KINDS: Record<string, SearchSuggestionKind> = {
  anime: "anime",
  anime_alias: "anime",
  local_file: "local",
  torrent: "torrent",
};

function suggestionKind(kind: string): SearchSuggestionKind {
  return SUGGESTION_KINDS[kind] ?? "history";
}

export function useSuggestions(
  query: string,
  scope: SearchSuggestionScope,
  limit = 8
): SearchSuggestion[] {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const requestRef = useRef<number>(0);
  const [debouncedQuery] = useDebouncedValue(query, { wait: 150 });

  useEffect(() => {
    const normalized = debouncedQuery.trim();
    if (!normalized || normalized.length < 2) {
      setSuggestions([]);
      return;
    }
    requestRef.current += 1;
    const requestId = requestRef.current;
    const terms = parseOperatorTerms(normalized);
    const nq = normalizeSearchText(normalized);
    const queryWords = terms ? [] : nq.split(" ");
    (async () => {
      // Recall pool: the backend only narrows candidates by FTS, the final
      // order is decided below with the shared ranking model.
      const [rows, error] = await attempt(
        collectionApi.searchUnifiedIndex(normalized, scope, suggestionPoolSize(limit))
      );
      if (requestRef.current !== requestId) return;
      if (error) {
        setSuggestions([]);
        return;
      }
      const now = Date.now();
      setSuggestions(
        (Array.isArray(rows) ? rows : [])
          .map((row) => {
            const match =
              matchNormalizedTitle(terms, nq, normalizeSearchText(row.value), queryWords) ?? 0;
            const counters = {
              useCount: row.useCount,
              selectedCount: row.selectedCount,
              ignoredCount: row.ignoredCount,
              lastUsedAt: row.lastUsedAt * 1000,
            };
            return {
              kind: suggestionKind(row.kind),
              score: suggestionScore(match, 0, counters, now),
              subtitle: row.subtitle ?? undefined,
              value: row.value,
            };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, Math.max(1, limit))
      );
    })();
  }, [limit, debouncedQuery, scope]);

  return suggestions;
}
