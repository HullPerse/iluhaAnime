import { KIND_ORDER } from "@/config/search/autocomplete.config";
import { SEARCH_RANKING } from "@/config/search/ranking.config";
import { ANIME_STATUS_BOOST } from "@/config/search/status.config";
import type {
  AnilistSuggestionBoost,
  SearchAnimeSuggestion,
  SearchQueryStat,
  SearchSuggestion,
  SearchSuggestionOptions,
  SuggestionSection,
} from "@/types/search";

import { isTagLikeQuery } from "./intent.utils";
import { LazySpellIndex } from "./lazySpellIndex.utils";
import { normalizeSearchText } from "./normalize.utils";
import { recencyBoost } from "./ranking.utils";
import {
  fuzzyMatchScore,
  fuzzyMatchScorePreNormalized,
  matchOperatorTerms,
  parseOperatorTerms,
} from "./score.utils";
import type { OperatorTerm } from "./score.utils";
import { readCachedSpellWords, writeCachedSpellWords } from "./spellIndexCache.utils";
import { normalizedSpellWords } from "./symspell.utils";

export { fuzzyMatchScore };

export type {
  SearchSuggestion,
  SearchSuggestionKind,
  SearchSuggestionOptions,
} from "@/types/search";

export { normalizeSearchText } from "./normalize.utils";

function statBoostNormalized(
  normalized: string,
  stats: Record<string, SearchQueryStat> | undefined
): number {
  const stat = stats?.[normalized];
  if (!stat) return 0;
  const ageHours = Math.max(0, (Date.now() - stat.lastUsedAt) / 3_600_000);
  const recency = recencyBoost(ageHours);
  const ignoredPenalty = Math.min(
    SEARCH_RANKING.IGNORED_PENALTY_CAP,
    (stat.ignoredCount ?? 0) * 10
  );
  return (
    Math.min(SEARCH_RANKING.COUNT_CAP, stat.count * SEARCH_RANKING.COUNT_WEIGHT) +
    recency +
    Math.min(
      SEARCH_RANKING.SELECTED_BOOST_CAP,
      stat.selectedCount * SEARCH_RANKING.LEARNING_SELECTED_WEIGHT
    ) -
    ignoredPenalty
  );
}

export function rankHistoryEntries(
  history: string[],
  stats: Record<string, SearchQueryStat> | undefined,
  limit: number
): string[] {
  const seen = new Set<string>();
  const scored: Array<{ value: string; score: number }> = [];
  for (const entry of history) {
    const value = entry.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    scored.push({ value, score: statBoostNormalized(normalizeSearchText(value), stats) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit)).map((item) => item.value);
}

function animeSubtitle(anime: SearchAnimeSuggestion): string {
  const status = anime.favourite ? "favourite" : anime.status.toLocaleLowerCase();
  const season = [anime.season, anime.seasonYear]
    .filter((value) => value != null && value !== "")
    .join(" ");
  return season ? `${status} - ${season}` : status;
}

function animeBoost(anime: SearchAnimeSuggestion, boost: AnilistSuggestionBoost): number {
  if (boost === "off") return 0;
  const scoreBoost = anime.score && anime.score > 0 ? anime.score * 2 : 0;
  const base = (anime.favourite ? 55 : 0) + (ANIME_STATUS_BOOST[anime.status] ?? 0) + scoreBoost;
  return boost === "strong" ? base * 1.5 : base;
}

const animeNormalizedTitlesCache = new WeakMap<SearchAnimeSuggestion[], string[][]>();

function getNormalizedAnimeTitles(animeIndex: SearchAnimeSuggestion[]): string[][] {
  const cached = animeNormalizedTitlesCache.get(animeIndex);
  if (cached) return cached;
  const titles = animeIndex.map((anime) =>
    [anime.title, ...anime.aliases].map(normalizeSearchText)
  );
  animeNormalizedTitlesCache.set(animeIndex, titles);
  return titles;
}
const symSpellCache = new WeakMap<object, { fingerprint: string; sym: LazySpellIndex }>();
const SYM_SPELL_LRU_MAX = 3;
const symSpellByFingerprint = new Map<string, LazySpellIndex>();
const animeFingerprintCache = new WeakMap<SearchAnimeSuggestion[], string>();

// Hashes only the titles the dictionary is actually built from, so the
// fingerprint cannot invalidate on alias edits that never reach the index.
function animeTitlesFingerprint(animeIndex: SearchAnimeSuggestion[] | undefined): string {
  if (!animeIndex) return "";
  const cached = animeFingerprintCache.get(animeIndex);
  if (cached !== undefined) return cached;
  let hash = 0;
  for (const anime of animeIndex) {
    for (const char of anime.title) {
      hash = Math.trunc(Math.imul(hash, 31) + (char.codePointAt(0) ?? 0));
    }
    hash = Math.trunc(Math.imul(hash, 31) + 1);
  }
  const fingerprint = `${animeIndex.length}:${hash}`;
  animeFingerprintCache.set(animeIndex, fingerprint);
  return fingerprint;
}

function symSpellFor(
  titles: string[],
  basis: object | undefined,
  fingerprint: string
): LazySpellIndex {
  const build = () =>
    new LazySpellIndex(readCachedSpellWords(fingerprint) ?? normalizedSpellWords(titles));
  if (!basis) return build();
  const hit = symSpellCache.get(basis);
  if (hit && hit.fingerprint === fingerprint) return hit.sym;
  const shared = symSpellByFingerprint.get(fingerprint);
  if (shared) {
    symSpellCache.set(basis, { fingerprint, sym: shared });
    return shared;
  }
  const sym = build();
  if (symSpellByFingerprint.size >= SYM_SPELL_LRU_MAX) {
    const oldest = symSpellByFingerprint.keys().next();
    if (!oldest.done) symSpellByFingerprint.delete(oldest.value);
  }
  symSpellByFingerprint.set(fingerprint, sym);
  symSpellCache.set(basis, { fingerprint, sym });
  return sym;
}

function addHistorySuggestions(
  normalizedQuery: string,
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  for (const value of options.history ?? []) {
    const normalizedValue = normalizeSearchText(value);
    const match = matchNormalizedTitle(terms, normalizedQuery, normalizedValue);
    if (match == null) continue;
    put({
      kind: "history",
      score:
        match +
        statBoostNormalized(normalizedValue, options.queryStats) +
        statBoostNormalized(normalizedValue, options.suggestionStats),
      subtitle: "history",
      value,
    });
  }
}

export function matchNormalizedTitle(
  terms: OperatorTerm[] | null,
  normalizedQuery: string,
  title: string
): number | null {
  return terms
    ? matchOperatorTerms(terms, title)
    : fuzzyMatchScorePreNormalized(normalizedQuery, title);
}

function addAnimeSuggestions(
  normalizedQuery: string,
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  if (options.scope === "player" || options.scope === "filter") return;
  const normalizedTitles = getNormalizedAnimeTitles(options.animeIndex ?? []);
  for (let index = 0; index < normalizedTitles.length; index++) {
    const anime = options.animeIndex?.[index];
    if (!anime) continue;
    let best = -Infinity;
    for (const title of normalizedTitles[index] ?? []) {
      const match = matchNormalizedTitle(terms, normalizedQuery, title);
      if (match != null && match > best) best = match;
    }
    if (!Number.isFinite(best)) continue;
    put({
      kind: "anime",
      score:
        best +
        animeBoost(anime, options.anilistBoost ?? "subtle") +
        statBoostNormalized(normalizedTitles[index]?.[0] ?? "", options.suggestionStats),
      subtitle: animeSubtitle(anime),
      value: anime.title,
    });
  }
}

function addExtraSuggestions(
  query: string,
  normalizedQuery: string,
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  const tagBoost =
    options.scope === "filter" && isTagLikeQuery(query, normalizeSearchText(query))
      ? SEARCH_RANKING.TAG_BOOST
      : 0;
  const showOperators = /[!^'$]/.test(query);
  for (const extra of options.extraValues ?? []) {
    if (extra.operator && !showOperators) continue;
    const normalizedExtra = normalizeSearchText(extra.value);
    const match = extra.operator
      ? SEARCH_RANKING.OPERATOR_HINT_SCORE
      : matchNormalizedTitle(terms, normalizedQuery, normalizedExtra);
    if (match == null) continue;
    put({
      kind: extra.kind ?? "local",
      score: match + tagBoost + statBoostNormalized(normalizedExtra, options.suggestionStats),
      value: extra.value,
      subtitle: extra.subtitle,
    });
  }
}

const collectionNormalizedCache = new WeakMap<
  NonNullable<SearchSuggestionOptions["collectionItems"]>,
  string[][]
>();

function getNormalizedCollectionTitles(
  items: NonNullable<SearchSuggestionOptions["collectionItems"]>
): string[][] {
  const cached = collectionNormalizedCache.get(items);
  if (cached) return cached;
  const titles = items.map((item) =>
    [item.title, ...(item.altTitles ?? [])].map(normalizeSearchText)
  );
  collectionNormalizedCache.set(items, titles);
  return titles;
}

function addCollectionSuggestions(
  normalizedQuery: string,
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  const items = options.collectionItems;
  if (!items || items.length === 0) return;
  const boost = options.collectionBoost ?? SEARCH_RANKING.COLLECTION_BOOST;
  const normalizedTitles = getNormalizedCollectionTitles(items);
  for (let index = 0; index < normalizedTitles.length; index++) {
    const item = items[index];
    if (!item) continue;
    const titles = normalizedTitles[index] ?? [];
    let best: number | null = null;
    for (const t of titles) {
      const m = matchNormalizedTitle(terms, normalizedQuery, t);
      if (m != null && (best == null || m > best)) best = m;
    }
    if (best == null) continue;
    const stat =
      statBoostNormalized(titles[0] ?? "", options.suggestionStats) +
      statBoostNormalized(titles[0] ?? "", options.queryStats);
    put({
      kind: "local",
      score: best + boost + stat,
      subtitle: item.subtitle,
      value: item.title,
    });
  }
}

function addSuggestionSources(
  query: string,
  normalizedQuery: string,
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (suggestion: SearchSuggestion) => void
): void {
  for (const suggestion of options.backendSuggestions ?? []) {
    if (!options.animeEnabled && suggestion.kind === "anime") continue;
    put(suggestion);
  }
  addCollectionSuggestions(normalizedQuery, terms, options, put);
  addHistorySuggestions(normalizedQuery, terms, options, put);
  addAnimeSuggestions(normalizedQuery, terms, options, put);
  addExtraSuggestions(query, normalizedQuery, terms, options, put);
}

function applySymSpellFallback(
  query: string,
  normalizedQuery: string,
  options: SearchSuggestionOptions,
  limit: number,
  candidates: Map<string, SearchSuggestion>,
  put: (s: SearchSuggestion) => void
): void {
  if (candidates.size >= limit) return;
  if (options.symSpell === false) return;
  if (normalizedQuery.length < 3) return;
  const history = options.history ?? [];
  const extra = options.extraValues?.map((e) => e.value) ?? [];
  const titlesForSymSpell = [
    ...history,
    ...(options.animeIndex?.map((a) => a.title) ?? []),
    ...extra,
  ];
  if (titlesForSymSpell.length === 0) return;
  const basis: object | undefined = options.animeIndex ?? options.history ?? options.extraValues;
  const fingerprint = `${animeTitlesFingerprint(options.animeIndex)}|h${history.map(normalizeSearchText).join("\n")}|e${extra.map(normalizeSearchText).join("\n")}`;
  const sym = symSpellFor(titlesForSymSpell, basis, fingerprint);
  const corrected = sym.suggest(query);
  if (!corrected) return;
  if (normalizeSearchText(corrected) === normalizedQuery) return;
  const cands = getSearchSuggestions(corrected, { ...options, limit: 2, symSpell: false });
  for (const c of cands) {
    put({ ...c, score: c.score - 50, subtitle: `${c.subtitle ?? c.kind} (did you mean)` });
  }
}
function spellTitles(
  options: Pick<SearchSuggestionOptions, "history" | "animeIndex" | "extraValues">
): {
  titles: string[];
  basis: object | undefined;
  fingerprint: string;
} {
  const history = options.history ?? [];
  const extra = options.extraValues?.map((entry) => entry.value) ?? [];
  const titles = [...history, ...(options.animeIndex?.map((entry) => entry.title) ?? []), ...extra];
  const basis: object | undefined = options.animeIndex ?? options.history ?? options.extraValues;
  const fingerprint = `${animeTitlesFingerprint(options.animeIndex)}|h${history.map(normalizeSearchText).join("\n")}|e${extra.map(normalizeSearchText).join("\n")}`;
  return { titles, basis, fingerprint };
}

export function suggestSpellings(
  query: string,
  options: Pick<
    SearchSuggestionOptions,
    "history" | "animeIndex" | "extraValues" | "symSpell"
  > = {},
  limit = 3
): string[] {
  const normalizedQuery = normalizeSearchText(query);
  if (options.symSpell === false) return [];
  if (normalizedQuery.length < 3) return [];
  const { titles, basis, fingerprint } = spellTitles(options);
  if (titles.length === 0) return [];
  return symSpellFor(titles, basis, fingerprint).suggestMany(query, limit);
}

export function suggestSpelling(
  query: string,
  options: Pick<SearchSuggestionOptions, "history" | "animeIndex" | "extraValues" | "symSpell"> = {}
): string | null {
  return suggestSpellings(query, options, 1)[0] ?? null;
}

const SPELL_PUMP_BATCH = 500;
const IDLE_TIMEOUT_MS = 2000;
const IDLE_FALLBACK_MS = 300;
const CAN_USE_IDLE =
  typeof window !== "undefined" && typeof window.requestIdleCallback === "function";

function scheduleIdle(run: () => void): number {
  if (CAN_USE_IDLE) return window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  return window.setTimeout(run, IDLE_FALLBACK_MS);
}

function cancelIdle(handle: number): void {
  if (CAN_USE_IDLE) {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

/**
 * Builds the did-you-mean index in idle slices so the first lookup is already
 * warm instead of blocking a render. Returns a cancel function for cleanup.
 */
export function prewarmSpelling(
  options: Pick<SearchSuggestionOptions, "history" | "animeIndex" | "extraValues" | "symSpell">
): () => void {
  if (options.symSpell === false) return () => {};
  const { titles, basis, fingerprint } = spellTitles(options);
  if (titles.length === 0) return () => {};
  const index = symSpellFor(titles, basis, fingerprint);
  if (index.ready) return () => {};
  let cancelled = false;
  let handle: number | undefined;
  const step = () => {
    handle = undefined;
    if (cancelled) return;
    if (index.pump(SPELL_PUMP_BATCH)) {
      writeCachedSpellWords(fingerprint, index.normalizedWords());
      return;
    }
    handle = scheduleIdle(step);
  };
  handle = scheduleIdle(step);
  return () => {
    cancelled = true;
    if (handle !== undefined) cancelIdle(handle);
  };
}

export function getSearchSuggestions(
  query: string,
  options: SearchSuggestionOptions = {}
): SearchSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = parseOperatorTerms(query);
  const limit = Math.max(1, options.limit ?? 8);
  const candidates = new Map<string, SearchSuggestion>();
  const put = (suggestion: SearchSuggestion) => {
    const key = normalizeSearchText(suggestion.value);
    if (!key) return;
    const current = candidates.get(key);
    if (!current || suggestion.score > current.score) candidates.set(key, suggestion);
  };
  addSuggestionSources(query, normalizedQuery, terms, options, put);
  applySymSpellFallback(query, normalizedQuery, options, limit, candidates, put);
  return [...candidates.values()]
    .sort(
      (a, b) =>
        b.score - a.score || a.value.length - b.value.length || a.value.localeCompare(b.value)
    )
    .slice(0, limit);
}

export function getInlineCompletion(query: string, suggestions: SearchSuggestion[]): string | null {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return null;
  const suggestion = suggestions.find((item) => {
    const value = normalizeSearchText(item.value);
    return value.startsWith(normalizedQuery) && value !== normalizedQuery;
  });
  return suggestion?.value ?? null;
}

export function groupSuggestions(suggestions: SearchSuggestion[]): {
  items: SearchSuggestion[];
  sections: SuggestionSection[];
} {
  const groups = new Map<SearchSuggestion["kind"], SearchSuggestion[]>();
  for (const suggestion of suggestions) {
    const group = groups.get(suggestion.kind) ?? [];
    group.push(suggestion);
    groups.set(suggestion.kind, group);
  }
  if (groups.size === 0) return { items: [], sections: [] };
  const order = [...groups.keys()].sort((left, right) => {
    if (left === "spell") return -1;
    if (right === "spell") return 1;
    const leftBest = groups.get(left)?.[0]?.score ?? 0;
    const rightBest = groups.get(right)?.[0]?.score ?? 0;
    if (rightBest !== leftBest) return rightBest - leftBest;
    return KIND_ORDER.indexOf(left) - KIND_ORDER.indexOf(right);
  });
  const items: SearchSuggestion[] = [];
  const sections: SuggestionSection[] = [];
  for (const kind of order) {
    const group = groups.get(kind)!;
    sections.push({
      kind,
      startIndex: items.length,
      endIndex: items.length + group.length,
    });
    items.push(...group);
  }
  return { items, sections };
}
