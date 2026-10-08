import { useEffect, useMemo, useState } from "react";

import { SPELL_CORRECTION_LIMIT } from "@/config/search/autocomplete.config";
import { useDebouncedValue } from "@/hooks/pacer.hook";

import { normalizeSearchText } from "@/lib/search/normalize.utils";
import { suggestSpelling, suggestSpellings } from "@/lib/search/suggestions.utils";
import { useCell } from "@/lib/state/signal.hook";
import { searchAtoms } from "@/store/search.store";
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

interface SpellCacheDeps {
  history: string[] | undefined;
  animeIndex: SearchAnimeSuggestion[] | undefined;
  extraValues: Array<{ value: string }> | undefined;
  symSpell: boolean | undefined;
  dictionary: string[];
}

interface SpellCacheEntry {
  deps: SpellCacheDeps;
  result: SpellCheck | null;
}

const QUERY_CACHE_MAX = 50;
const spellQueryCache = new Map<string, SpellCacheEntry>();
const dictionarySetCache = new WeakMap<string[], Set<string>>();

function sameSpellDeps(left: SpellCacheDeps, right: SpellCacheDeps): boolean {
  return (
    left.history === right.history &&
    left.animeIndex === right.animeIndex &&
    left.extraValues === right.extraValues &&
    left.symSpell === right.symSpell &&
    left.dictionary === right.dictionary
  );
}

function readQueryCache(trimmed: string, deps: SpellCacheDeps): SpellCheck | null | undefined {
  const entry = spellQueryCache.get(trimmed);
  if (!entry || !sameSpellDeps(entry.deps, deps)) return undefined;
  return entry.result;
}

function writeQueryCache(trimmed: string, deps: SpellCacheDeps, result: SpellCheck | null): void {
  if (spellQueryCache.size >= QUERY_CACHE_MAX) {
    const oldest = spellQueryCache.keys().next();
    if (!oldest.done) spellQueryCache.delete(oldest.value);
  }
  spellQueryCache.set(trimmed, { deps, result });
}

function sameSpellCheck(left: SpellCheck | null, right: SpellCheck | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.correction === right.correction &&
    left.start === right.start &&
    left.end === right.end &&
    left.severity === right.severity &&
    left.word === right.word
  );
}

function dictionarySetOf(dictionary: string[]): Set<string> {
  const cached = dictionarySetCache.get(dictionary);
  if (cached) return cached;
  const set = new Set(dictionary);
  dictionarySetCache.set(dictionary, set);
  return set;
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
  const dictionary = useCell(searchAtoms.spellDictionary);
  const [debouncedQuery, { isPending }] = useDebouncedValue(query, { wait: debounceMs });
  const [stableResult, setStableResult] = useState<SpellCheck | null>(null);

  const fresh = useMemo(() => {
    if (isPending || debouncedQuery !== query) return null;
    const trimmed = query.trim();
    if (trimmed.length < 3) return null;
    const deps: SpellCacheDeps = { history, animeIndex, extraValues, symSpell, dictionary };
    const cached = readQueryCache(trimmed, deps);
    if (cached !== undefined) return cached;
    const correction = suggestSpelling(trimmed, { history, animeIndex, extraValues, symSpell });
    let result: SpellCheck | null = null;
    if (correction) {
      const span = diffWordSpan(trimmed, correction);
      if (span) {
        const normalized = normalizeSearchText(span.word);
        if (!dictionarySetOf(dictionary).has(normalized)) {
          const leading = query.length - query.trimStart().length;
          result = {
            correction,
            start: span.start + leading,
            end: span.end + leading,
            severity:
              editDistance(normalized, normalizeSearchText(span.corrected)) <= 1
                ? "warn"
                : "error",
            word: span.word,
          };
        }
      }
    }
    writeQueryCache(trimmed, deps, result);
    return result;
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

  useEffect(() => {
    setStableResult((prev) => (sameSpellCheck(prev, fresh) ? prev : fresh));
  }, [fresh]);

  return sameSpellCheck(stableResult, fresh) ? stableResult : fresh;
}

export function useSpellCorrections(
  query: string,
  options: SpellCheckOptions,
  limit = SPELL_CORRECTION_LIMIT
): string[] {
  const { history, animeIndex, extraValues, symSpell, debounceMs = 400 } = options;
  const dictionary = useCell(searchAtoms.spellDictionary);
  const [debouncedQuery, { isPending }] = useDebouncedValue(query, { wait: debounceMs });

  return useMemo(() => {
    if (isPending || debouncedQuery !== query) return [];
    const trimmed = query.trim();
    if (trimmed.length < 3) return [];
    const words = dictionarySetOf(dictionary);
    return suggestSpellings(
      trimmed,
      { history, animeIndex, extraValues, symSpell },
      limit
    ).filter((correction) => {
      const span = diffWordSpan(trimmed, correction);
      if (!span) return false;
      return !words.has(normalizeSearchText(span.word));
    });
  }, [
    debouncedQuery,
    isPending,
    query,
    history,
    animeIndex,
    extraValues,
    symSpell,
    dictionary,
    limit,
  ]);
}
