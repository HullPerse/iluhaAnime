import { KIND_ORDER } from "@/config/autocomplete.config";
import { ANIME_STATUS_BOOST } from "@/config/status.config";
import { scheduleTask, type ScheduledTask } from "@/lib/shared.utils";
import { feedbackScore } from "@/lib/feedback.utils";
import { countersOf, learningStatKey } from "@/lib/learning.utils";
import { RANKING } from "@/config/ranking.config";
import { markSpellingReady } from "@/lib/signals.utils";
import type {
  AnilistSuggestionBoost,
  SearchAnimeSuggestion,
  SearchQueryStat,
  SearchSuggestion,
  SearchSuggestionOptions,
  SuggestionSection,
} from "@/types/search";

import { isTagLikeQuery } from "@/lib/intent.utils";
import { LazySpellIndex } from "@/lib/lazySpellIndex.utils";
import { normalizeSearchText } from "@/lib/normalize.utils";
import { stripReleaseNoise } from "@/lib/release.utils";
import {
  fuzzyMatchScore,
  fuzzyMatchScorePreNormalized,
  matchOperatorTerms,
  parseOperatorTerms,
} from "@/lib/searchScore.utils";
import type { OperatorTerm } from "@/lib/searchScore.utils";
import { readCachedSpellWords, writeCachedSpellWords } from "@/lib/spellIndexCache.utils";
import { normalizedSpellWords } from "@/lib/symspell.utils";
import { titleKindBonus, typedTitlesOf } from "@/lib/searchTitle.utils";

export { fuzzyMatchScore };

export type {
  SearchSuggestion,
  SearchSuggestionKind,
  SearchSuggestionOptions,
} from "@/types/search";

export { normalizeSearchText } from "@/lib/normalize.utils";

function statFeedback(stats: Record<string, SearchQueryStat> | undefined, key: string): number {
  const stat = stats?.[key];
  return stat ? feedbackScore(countersOf(stat)) : 0;
}

function historyFeedback(
  stats: Record<string, SearchQueryStat> | undefined,
  scope: string | undefined,
  normalized: string
): number {
  const scoped = stats?.[learningStatKey(scope ?? "global", normalized)];
  return scoped ? feedbackScore(countersOf(scoped)) : statFeedback(stats, normalized);
}

export function rankHistoryEntries(
  history: string[],
  stats: Record<string, SearchQueryStat> | undefined,
  limit: number,
  scope?: string
): string[] {
  const seen = new Set<string>();
  const scored: Array<{ value: string; score: number }> = [];
  for (const entry of history) {
    const value = entry.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    scored.push({ value, score: historyFeedback(stats, scope, normalizeSearchText(value)) });
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
const animeTitleBonusCache = new WeakMap<SearchAnimeSuggestion[], number[][]>();

function getNormalizedAnimeTitles(animeIndex: SearchAnimeSuggestion[]): string[][] {
  const cached = animeNormalizedTitlesCache.get(animeIndex);
  if (cached) return cached;
  const titles = animeIndex.map((anime) =>
    anime.typedTitles && anime.typedTitles.length > 0
      ? anime.typedTitles.map((entry) => normalizeSearchText(entry.title))
      : [anime.title, ...anime.aliases].map(normalizeSearchText)
  );
  animeNormalizedTitlesCache.set(animeIndex, titles);
  return titles;
}

function getAnimeTitleBonuses(animeIndex: SearchAnimeSuggestion[]): number[][] {
  const cached = animeTitleBonusCache.get(animeIndex);
  if (cached) return cached;
  const bonuses = animeIndex.map((anime) =>
    anime.typedTitles && anime.typedTitles.length > 0
      ? anime.typedTitles.map((entry) => titleKindBonus(entry.kind))
      : [anime.title, ...anime.aliases].map(() => 0)
  );
  animeTitleBonusCache.set(animeIndex, bonuses);
  return bonuses;
}
const symSpellCache = new WeakMap<object, { fingerprint: string; sym: LazySpellIndex }>();
const SYM_SPELL_LRU_MAX = 3;
const symSpellByFingerprint = new Map<string, LazySpellIndex>();
const animeFingerprintCache = new WeakMap<SearchAnimeSuggestion[], string>();

export function resetSymSpellCache(): void {
  symSpellByFingerprint.clear();
}

function animeTitlesFingerprint(animeIndex: SearchAnimeSuggestion[] | undefined): string {
  if (!animeIndex) return "";
  const cached = animeFingerprintCache.get(animeIndex);
  if (cached !== undefined) return cached;
  let hash = 0;
  for (const anime of animeIndex) {
    for (const entry of typedTitlesOf(anime)) {
      for (const char of entry.title) {
        hash = Math.trunc(Math.imul(hash, 31) + (char.codePointAt(0) ?? 0));
      }
      hash = Math.trunc(Math.imul(hash, 31) + 1);
    }
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
  queryWords: string[],
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  for (const value of options.history ?? []) {
    const normalizedValue = normalizeSearchText(value);
    const match = matchNormalizedTitle(terms, normalizedQuery, normalizedValue, queryWords);
    if (match == null) continue;
    put({
      kind: "history",
      score:
        match +
        historyFeedback(options.queryStats, options.scope, normalizedValue) +
        statFeedback(options.suggestionStats, normalizedValue),
      subtitle: "history",
      value,
    });
  }
}

export function matchNormalizedTitle(
  terms: OperatorTerm[] | null,
  normalizedQuery: string,
  title: string,
  queryWords: string[] = normalizedQuery.split(" "),
  targetWords?: string[]
): number | null {
  return terms
    ? matchOperatorTerms(terms, title)
    : fuzzyMatchScorePreNormalized(normalizedQuery, title, queryWords, targetWords);
}

function addAnimeSuggestions(
  normalizedQuery: string,
  queryWords: string[],
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  if (options.scope === "player" || options.scope === "filter") return;
  const normalizedTitles = getNormalizedAnimeTitles(options.animeIndex ?? []);
  const titleBonuses = getAnimeTitleBonuses(options.animeIndex ?? []);
  for (let index = 0; index < normalizedTitles.length; index++) {
    const anime = options.animeIndex?.[index];
    if (!anime) continue;
    const bonuses = titleBonuses[index] ?? [];
    let best = -Infinity;
    for (let titleIndex = 0; titleIndex < (normalizedTitles[index] ?? []).length; titleIndex++) {
      const title = (normalizedTitles[index] ?? [])[titleIndex] ?? "";
      const match = matchNormalizedTitle(terms, normalizedQuery, title, queryWords);
      if (match != null) {
        const scored = match + (bonuses[titleIndex] ?? 0);
        if (scored > best) best = scored;
      }
    }
    if (!Number.isFinite(best)) continue;
    put({
      kind: "anime",
      score:
        best +
        animeBoost(anime, options.anilistBoost ?? "subtle") +
        statFeedback(options.suggestionStats, normalizedTitles[index]?.[0] ?? ""),
      subtitle: animeSubtitle(anime),
      value: anime.title,
    });
  }
}

function addExtraSuggestions(
  query: string,
  normalizedQuery: string,
  queryWords: string[],
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  const tagBoost =
    options.scope === "filter" && isTagLikeQuery(query, normalizeSearchText(query))
      ? RANKING.TAG_BOOST
      : 0;
  const showOperators = /[!^'$]/.test(query);
  for (const extra of options.extraValues ?? []) {
    if (extra.operator && !showOperators) continue;
    const normalizedExtra = normalizeSearchText(extra.value);
    const match = extra.operator
      ? RANKING.OPERATOR_HINT_SCORE
      : matchNormalizedTitle(terms, normalizedQuery, normalizedExtra, queryWords);
    if (match == null) continue;
    put({
      kind: extra.kind ?? "local",
      score: match + tagBoost + statFeedback(options.suggestionStats, normalizedExtra),
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
  queryWords: string[],
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  const items = options.collectionItems;
  if (!items || items.length === 0) return;
  const boost = options.collectionBoost ?? RANKING.COLLECTION_BOOST;
  const normalizedTitles = getNormalizedCollectionTitles(items);
  for (let index = 0; index < normalizedTitles.length; index++) {
    const item = items[index];
    if (!item) continue;
    const titles = normalizedTitles[index] ?? [];
    let best: number | null = null;
    for (const t of titles) {
      const m = matchNormalizedTitle(terms, normalizedQuery, t, queryWords);
      if (m != null && (best == null || m > best)) best = m;
    }
    if (best == null) continue;
    const stat =
      historyFeedback(options.suggestionStats, options.scope, titles[0] ?? "") +
      historyFeedback(options.queryStats, options.scope, titles[0] ?? "");
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
  queryWords: string[],
  terms: OperatorTerm[] | null,
  options: SearchSuggestionOptions,
  put: (suggestion: SearchSuggestion) => void
): void {
  for (const suggestion of options.backendSuggestions ?? []) {
    if (!options.animeEnabled && suggestion.kind === "anime") continue;
    put(suggestion);
  }
  addCollectionSuggestions(normalizedQuery, queryWords, terms, options, put);
  addHistorySuggestions(normalizedQuery, queryWords, terms, options, put);
  addAnimeSuggestions(normalizedQuery, queryWords, terms, options, put);
  addExtraSuggestions(query, normalizedQuery, queryWords, terms, options, put);
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
  const cands = collectSuggestions(corrected, { ...options, limit: 2, symSpell: false });
  for (const c of cands) {
    put({ ...c, score: c.score - 50, subtitle: `${c.subtitle ?? c.kind} (did you mean)` });
  }
}
export function spellTitles(
  options: Pick<SearchSuggestionOptions, "history" | "animeIndex" | "extraValues">
): {
  titles: string[];
  basis: object | undefined;
  fingerprint: string;
} {
  const history = options.history ?? [];
  const extra = options.extraValues?.map((entry) => entry.value) ?? [];
  const animeTitles = (options.animeIndex ?? []).flatMap((entry) =>
    entry.typedTitles && entry.typedTitles.length > 0
      ? entry.typedTitles.map((typed) => typed.title)
      : [entry.title, ...entry.aliases]
  );
  const titles = [...history, ...animeTitles, ...extra];
  const basis: object | undefined = options.animeIndex ?? options.history ?? options.extraValues;
  const fingerprint = `${animeTitlesFingerprint(options.animeIndex)}|h${history.map(normalizeSearchText).join("\n")}|e${extra.map(normalizeSearchText).join("\n")}`;
  return { titles, basis, fingerprint };
}

export function spellKnownWords(
  options: Pick<SearchSuggestionOptions, "history" | "animeIndex" | "extraValues">
): Set<string> {
  const { titles } = spellTitles(options);
  const words = new Set<string>();
  for (const title of titles) {
    for (const word of normalizeSearchText(title).split(" ")) {
      if (word) words.add(word);
    }
  }
  return words;
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

function scheduleIdle(run: () => void): ScheduledTask {
  if (CAN_USE_IDLE) {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return { cancel: () => window.cancelIdleCallback(id) };
  }
  return scheduleTask("timeout", IDLE_FALLBACK_MS, run);
}

function cancelIdle(task: ScheduledTask): void {
  task.cancel();
}

export function prewarmSpelling(
  options: Pick<SearchSuggestionOptions, "history" | "animeIndex" | "extraValues" | "symSpell">
): () => void {
  if (options.symSpell === false) {
    markSpellingReady();
    return () => {};
  }
  const { titles, basis, fingerprint } = spellTitles(options);
  if (titles.length === 0) {
    markSpellingReady();
    return () => {};
  }
  const index = symSpellFor(titles, basis, fingerprint);
  if (index.ready) {
    markSpellingReady();
    return () => {};
  }
  let cancelled = false;
  let handle: ScheduledTask | undefined;
  const step = () => {
    handle = undefined;
    if (cancelled) return;
    if (index.pump(SPELL_PUMP_BATCH)) {
      writeCachedSpellWords(fingerprint, index.normalizedWords());
      markSpellingReady();
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
  const fallback = suggestionFallbackQuery(query);
  // A quality tag, episode token, or bracket group is strong evidence that the
  // user pasted a release name; the cleaned query is then the better intent
  // even if the raw one matched something. Generic tokens like "dual" or
  // "web" can be part of a real title, so those keep the direct pass first.
  if (fallback && STRONG_NOISE_RE.test(query)) {
    const cleaned = collectSuggestions(fallback, options);
    if (cleaned.length > 0) return cleaned;
  }
  const direct = collectSuggestions(query, options);
  if (direct.length > 0 || !fallback) return direct;
  return collectSuggestions(fallback, options);
}

const STRONG_NOISE_RE =
  /\[[^\]]*\]|\{[^}]*\}|\b\d{3,4}p\b|\b\d{3,4}x\d{3,4}\b|\b(?:s\d{1,2})?e(?:p)?\d{1,4}\b|\bepisode\s*\d{1,4}\b/i;
const EPISODE_TOKEN_RE = /\b(?:s\d{1,2})?e(?:p)?\d{1,4}\b/gi;
const EPISODE_WORD_RE = /\bepisode\s*\d{1,4}\b/gi;
const TRAILING_EPISODE_RE = /\s*[-\u2013]\s*\d{1,4}\s*$/g;

function suggestionFallbackQuery(query: string): string | null {
  const cleaned = stripReleaseNoise(query)
    .replaceAll(EPISODE_TOKEN_RE, " ")
    .replaceAll(EPISODE_WORD_RE, " ")
    .replaceAll(TRAILING_EPISODE_RE, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const normalized = normalizeSearchText(cleaned);
  const original = normalizeSearchText(query);
  return normalized && normalized !== original ? normalized : null;
}

function collectSuggestions(query: string, options: SearchSuggestionOptions): SearchSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = parseOperatorTerms(query);
  const queryWords = terms ? [] : normalizedQuery.split(" ");
  const limit = Math.max(1, options.limit ?? 8);
  const candidates = new Map<string, SearchSuggestion>();
  const put = (suggestion: SearchSuggestion) => {
    const key = normalizeSearchText(suggestion.value);
    if (!key) return;
    const current = candidates.get(key);
    if (!current || suggestion.score > current.score) candidates.set(key, suggestion);
  };
  addSuggestionSources(query, normalizedQuery, queryWords, terms, options, put);
  applySymSpellFallback(query, normalizedQuery, options, limit, candidates, put);
  const sorted = [...candidates.values()].sort(
    (a, b) => b.score - a.score || a.value.length - b.value.length || a.value.localeCompare(b.value)
  );
  promoteBaseTitles(sorted);
  return sorted.slice(0, limit);
}

const BASE_TITLE_PROMOTION_RATIO = 0.9;

function isSequelTitle(longer: string, base: string): boolean {
  const baseTitle = normalizeSearchText(base);
  const longerTitle = normalizeSearchText(longer);
  return baseTitle.length > 0 && longerTitle.startsWith(`${baseTitle} `);
}

/**
 * A six-character prefix such as "jujuts" can match a sequel or movie that
 * carries a bigger popularity boost, pushing the base title down. When one
 * candidate only extends another and is within 10% of its score, the base
 * title is the better autocomplete answer. Unrelated titles never reorder.
 */
function promoteBaseTitles(items: SearchSuggestion[]): void {
  for (let index = 0; index < items.length - 1; index++) {
    const longer = items[index];
    if (!longer) continue;
    for (let candidate = index + 1; candidate < items.length; candidate++) {
      const base = items[candidate];
      if (!base || base.score < longer.score * BASE_TITLE_PROMOTION_RATIO) continue;
      if (!isSequelTitle(longer.value, base.value)) continue;
      items.splice(candidate, 1);
      items.splice(index, 0, base);
      index += 1;
      break;
    }
  }
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
