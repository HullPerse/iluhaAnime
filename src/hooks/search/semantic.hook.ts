import { useEffect, useState } from "react";

import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { UnifiedIndexRow } from "@/types/search";

function toSuggestion(row: UnifiedIndexRow, score: number): SearchSuggestion {
  const kind =
    row.kind === "anime" || row.kind === "anime_alias"
      ? "anime"
      : row.kind === "torrent"
        ? "torrent"
        : row.kind === "local_file"
          ? "local"
          : "history";
  return {
    kind: kind as SearchSuggestion["kind"],
    score,
    subtitle: row.subtitle ?? undefined,
    value: row.value,
  };
}

export function useSemanticSuggestions(
  query: string,
  enabled: boolean,
  limit = 8
): SearchSuggestion[] {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      return;
    }
    const q = query.trim();
    if (!q || q.length < 3) {
      setSuggestions([]);
      return;
    }
    let disposed = false;
    invokeTyped<boolean>("is_fastembed_initialized")
      .then((inited) => {
        if (!inited || disposed) return;
        return invokeTyped<UnifiedIndexRow[]>("search_semantic", { query: q, limit }).then(
          (rows) => {
            if (disposed) return;
            const mapped = (Array.isArray(rows) ? rows : []).map((row) =>
              toSuggestion(row, 150 + (row.useCount ?? 0))
            );
            setSuggestions(mapped);
          }
        );
      })
      .catch(() => {
        if (!disposed) setSuggestions([]);
      });
    return () => {
      disposed = true;
    };
  }, [query, enabled, limit]);

  return suggestions;
}
