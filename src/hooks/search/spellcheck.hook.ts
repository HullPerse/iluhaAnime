import { useMemo } from "react";

import { useDebouncedValue } from "@/hooks/pacer.hook";

import { normalizeSearchText } from "@/lib/search/normalize.utils";
import { suggestSpelling } from "@/lib/search/suggestions.utils";
import { useSearchStore } from "@/store/search.store";
import type { SearchAnimeSuggestion, SpellCheck } from "@/types/search";

interface SpellCheckOptions {
  history?: string[];
  animeIndex?: SearchAnimeSuggestion[];
  extraValues?: Array<{ value: string }>;
  symSpell?: boolean;
  debounceMs?: number;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

function wordSpans(value: string): Array<{ word: string; start: number; end: number }> {
  const spans: Array<{ word: string; start: number; end: number }> = [];
  const wordRe = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(value)) !== null) {
    spans.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function diffWordSpan(
  query: string,
  correction: string
): { start: number; end: number; word: string; corrected: string } | null {
  const queryWords = wordSpans(query);
  const correctedWords = wordSpans(correction);
  const count = Math.min(queryWords.length, correctedWords.length);
  for (let i = 0; i < count; i++) {
    const left = normalizeSearchText(queryWords[i].word);
    const right = normalizeSearchText(correctedWords[i].word);
    if (left && left !== right) {
      return {
        start: queryWords[i].start,
        end: queryWords[i].end,
        word: queryWords[i].word,
        corrected: correctedWords[i].word,
      };
    }
  }
  return null;
}

export function useSpellCheck(query: string, options: SpellCheckOptions): SpellCheck | null {
  const { history, animeIndex, extraValues, symSpell, debounceMs = 400 } = options;
  const dictionary = useSearchStore((s) => s.spellDictionary);
  const [debouncedQuery, { isPending }] = useDebouncedValue(query, { wait: debounceMs });

  return useMemo(() => {
    if (isPending || debouncedQuery !== query) return null;
    const trimmed = query.trim();
    if (trimmed.length < 3) return null;
    const correction = suggestSpelling(trimmed, { history, animeIndex, extraValues, symSpell });
    if (!correction) return null;
    const span = diffWordSpan(trimmed, correction);
    if (!span) return null;
    const normalized = normalizeSearchText(span.word);
    if (dictionary.includes(normalized)) return null;
    const leading = query.length - query.trimStart().length;
    return {
      correction,
      start: span.start + leading,
      end: span.end + leading,
      severity:
        editDistance(normalized, normalizeSearchText(span.corrected)) <= 1 ? "warn" : "error",
      word: span.word,
    };
  }, [
    debouncedQuery,
    isPending,
    query,
    history,
    animeIndex,
    extraValues,
    symSpell,
    dictionary,
  ]);
}
