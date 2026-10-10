import { useEffect, useMemo, useRef, useState } from "react";

import { SPELL_CORRECTION_LIMIT } from "@/config/search/autocomplete.config";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { normalizeSearchText } from "@/lib/search/normalize.utils";
import { suggestSpelling, suggestSpellings } from "@/lib/search/suggestions.utils";
import { useCell } from "@/lib/state/signal.hook";
import { searchAtoms } from "@/store/search.store";
import type { SearchAnimeSuggestion, SpellCheck, SpellWordSpan } from "@/types/search";

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

function diffWordSpans(
  query: string,
  correction: string
): Array<{ start: number; end: number; word: string; corrected: string }> {
  const queryWords = wordSpans(query);
  const correctedWords = wordSpans(correction);
  const count = Math.min(queryWords.length, correctedWords.length);
  const out: Array<{ start: number; end: number; word: string; corrected: string }> = [];
  for (let i = 0; i < count; i++) {
    const left = normalizeSearchText(queryWords[i].word);
    const right = normalizeSearchText(correctedWords[i].word);
    if (left && left !== right) {
      out.push({
        start: queryWords[i].start,
        end: queryWords[i].end,
        word: queryWords[i].word,
        corrected: correctedWords[i].word,
      });
    }
  }
  return out;
}

function diffWordSpan(
  query: string,
  correction: string
): { start: number; end: number; word: string; corrected: string } | null {
  return diffWordSpans(query, correction)[0] ?? null;
}

function spellSeverity(word: string, corrected: string): SpellCheck["severity"] {
  return editDistance(normalizeSearchText(word), normalizeSearchText(corrected)) <= 1
    ? "warn"
    : "error";
}

export function spellSpansOf(check: SpellCheck | null): SpellWordSpan[] {
  if (!check) return [];
  if (check.spans && check.spans.length > 0) return check.spans;
  return [
    {
      start: check.start,
      end: check.end,
      severity: check.severity,
      word: check.word,
      corrected: check.correction,
    },
  ];
}

function sameSpellCheck(left: SpellCheck | null, right: SpellCheck | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.correction !== right.correction ||
    left.start !== right.start ||
    left.end !== right.end ||
    left.severity !== right.severity ||
    left.word !== right.word
  ) {
    return false;
  }
  const leftSpans = spellSpansOf(left);
  const rightSpans = spellSpansOf(right);
  if (leftSpans.length !== rightSpans.length) return false;
  return leftSpans.every(
    (span, index) =>
      span.start === rightSpans[index].start &&
      span.end === rightSpans[index].end &&
      span.severity === rightSpans[index].severity &&
      span.word === rightSpans[index].word &&
      span.corrected === rightSpans[index].corrected
  );
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) index++;
  return index;
}

function commonSuffixLength(a: string, b: string, prefix: number): number {
  const max = Math.min(a.length, b.length) - prefix;
  let index = 0;
  while (index < max && a[a.length - 1 - index] === b[b.length - 1 - index]) index++;
  return index;
}

/**
 * Re-anchors a previous spell check onto a newer query while the debounce is
 * still pending. Spans whose word is untouched by the edit are kept (and
 * shifted), so typing elsewhere never forces the highlight to be redrawn;
 * spans that the edit intersects are dropped until the next settled pass.
 */
function reanchorSpellCheck(
  previous: { query: string; result: SpellCheck | null },
  query: string
): SpellCheck | null {
  const { result } = previous;
  if (!result) return null;
  if (previous.query === query) return result;
  const prefix = commonPrefixLength(previous.query, query);
  const suffix = commonSuffixLength(previous.query, query, prefix);
  const editStart = prefix;
  const editEnd = previous.query.length - suffix;
  const delta = query.length - previous.query.length;
  const kept: SpellWordSpan[] = [];
  for (const span of spellSpansOf(result)) {
    if (editStart < span.end && editEnd > span.start) continue;
    const shift = span.start >= editEnd ? delta : 0;
    const start = span.start + shift;
    const end = span.end + shift;
    if (start < 0 || end > query.length) continue;
    if (query.slice(start, end) !== span.word) continue;
    const before = start === 0 || /\s/.test(query[start - 1]);
    const after = end === query.length || /\s/.test(query[end]);
    if (!before || !after) continue;
    kept.push({ ...span, start, end });
  }
  const first = kept[0];
  if (!first) return null;
  const original = spellSpansOf(result);
  const unchanged =
    kept.length === original.length &&
    kept.every(
      (span, index) =>
        span.start === original[index].start &&
        span.end === original[index].end &&
        span.severity === original[index].severity &&
        span.word === original[index].word &&
        span.corrected === original[index].corrected
    );
  if (unchanged) return result;
  return {
    ...result,
    spans: kept,
    start: first.start,
    end: first.end,
    severity: first.severity,
    word: first.word,
  };
}

export function useSpellCheck(query: string, options: SpellCheckOptions): SpellCheck | null {
  const { history, animeIndex, extraValues, symSpell, debounceMs = 400 } = options;
  const dictionary = useCell(searchAtoms.spellDictionary);
  const [debouncedQuery, { isPending }] = useDebouncedValue(query, { wait: debounceMs });
  const settled = !isPending && debouncedQuery === query;

  const fresh = useMemo(() => {
    if (!settled) return null;
    const trimmed = query.trim();
    if (trimmed.length < 3) return null;
    const deps: SpellCacheDeps = { history, animeIndex, extraValues, symSpell, dictionary };
    const cached = readQueryCache(trimmed, deps);
    if (cached !== undefined) return cached;
    const correction = suggestSpelling(trimmed, { history, animeIndex, extraValues, symSpell });
    let result: SpellCheck | null = null;
    if (correction) {
      const dict = dictionarySetOf(dictionary);
      const leading = query.length - query.trimStart().length;
      const spans = diffWordSpans(trimmed, correction)
        .map((span) => ({
          start: span.start + leading,
          end: span.end + leading,
          severity: spellSeverity(span.word, span.corrected),
          word: span.word,
          corrected: span.corrected,
        }))
        .filter((span) => !dict.has(normalizeSearchText(span.word)));
      const first = spans[0];
      if (first) {
        result = {
          correction,
          start: first.start,
          end: first.end,
          severity: first.severity,
          word: first.word,
          spans,
        };
      }
    }
    writeQueryCache(trimmed, deps, result);
    return result;
  }, [settled, query, history, animeIndex, extraValues, symSpell, dictionary]);

  const [carry, setCarry] = useState<{ query: string; result: SpellCheck | null }>({
    query,
    result: null,
  });
  const armedRef = useRef(false);
  useEffect(() => {
    // The debounce reports `isPending: false` on its very first render, before
    // its engine effect schedules. Only carry over results once a genuinely
    // settled pass has been observed after a pending one.
    if (!settled) {
      armedRef.current = true;
      return;
    }
    if (armedRef.current) setCarry({ query, result: fresh });
  }, [settled, query, fresh]);

  // While the debounce is pending, re-anchor the last settled result so an
  // untouched highlight keeps its identity (and its span) instead of blinking.
  // `shown` keeps the returned reference stable while the content is unchanged.
  const next = settled ? fresh : reanchorSpellCheck(carry, query);
  const [shown, setShown] = useState<SpellCheck | null>(next);
  const value = sameSpellCheck(shown, next) ? shown : next;
  useEffect(() => {
    setShown(value);
  }, [value]);
  return value;
}

export function useSpellCorrections(
  query: string,
  options: SpellCheckOptions,
  limit = SPELL_CORRECTION_LIMIT
): string[] {
  const { history, animeIndex, extraValues, symSpell, debounceMs = 400 } = options;
  const dictionary = useCell(searchAtoms.spellDictionary);
  const [debouncedQuery, { isPending }] = useDebouncedValue(query, { wait: debounceMs });
  const settled = !isPending && debouncedQuery === query;

  const fresh = useMemo(() => {
    if (!settled) return [];
    const trimmed = query.trim();
    if (trimmed.length < 3) return [];
    const words = dictionarySetOf(dictionary);
    return suggestSpellings(trimmed, { history, animeIndex, extraValues, symSpell }, limit).filter(
      (correction) => {
        const span = diffWordSpan(trimmed, correction);
        if (!span) return false;
        return !words.has(normalizeSearchText(span.word));
      }
    );
  }, [settled, query, history, animeIndex, extraValues, symSpell, dictionary, limit]);

  const [carry, setCarry] = useState<string[]>([]);
  const armedRef = useRef(false);
  useEffect(() => {
    if (!settled) {
      armedRef.current = true;
      return;
    }
    if (armedRef.current) setCarry(fresh);
  }, [settled, fresh]);

  const next = settled ? fresh : carry;
  const [shown, setShown] = useState<string[]>(next);
  const value = sameStringArray(shown, next) ? shown : next;
  useEffect(() => {
    setShown(value);
  }, [value]);
  return value;
}
