import { ANIME_STATUS_BOOST } from "@/config/animeStatus.config";
import { SEARCH_RANKING } from "@/config/searchRanking.config";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AnilistSuggestionBoost,
  SearchAnimeSuggestion,
  SearchQueryStat,
  SearchSuggestion,
  SearchSuggestionOptions,
} from "@/types/search";

import { normalizeSearchText } from "./normalize.utils";
import { recencyBoost } from "./searchRanking.utils";
import { semanticScore } from "./semantic.utils";
import { buildSymSpellFromTitles } from "./symspell.utils";

export type {
  AnilistSuggestionBoost,
  SearchSuggestion,
  SearchSuggestionKind,
  SearchSuggestionOptions,
} from "@/types/search";

export { normalizeSearchText } from "./normalize.utils";

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

/** Best per-word match of a single query word against a candidate word. */
function wordMatchScore(queryWord: string, targetWord: string): number | null {
  if (targetWord === queryWord) return 200;
  if (targetWord.startsWith(queryWord)) {
    return 180 - Math.min(40, targetWord.length - queryWord.length);
  }
  if (targetWord.includes(queryWord)) {
    return 120 - Math.min(30, targetWord.indexOf(queryWord));
  }
  if (queryWord.length < 3) return null;

  let queryIndex = 0;
  let gaps = 0;
  for (const character of targetWord) {
    if (character === queryWord[queryIndex]) queryIndex++;
    else if (queryIndex > 0) gaps++;
    if (queryIndex === queryWord.length) {
      return 90 - Math.min(60, gaps * 8);
    }
  }

  if (
    Math.abs(targetWord.length - queryWord.length) <= Math.max(2, Math.floor(queryWord.length / 3))
  ) {
    const distance = levenshtein(queryWord, targetWord);
    if (distance <= Math.max(1, Math.floor(queryWord.length / 4))) {
      return 70 - distance * 15;
    }
  }

  return null;
}

/** Matches every query word against distinct candidate words, in order. */
function multiWordScore(queryWords: string[], target: string): number | null {
  const targetWords = target.split(" ");
  const used = new Set<number>();
  let total = 0;
  let previousIndex = -1;
  let orderPenalty = 0;

  for (const queryWord of queryWords) {
    let bestIndex = -1;
    let bestScore = -1;
    for (let index = 0; index < targetWords.length; index++) {
      if (used.has(index)) continue;
      const score = wordMatchScore(queryWord, targetWords[index]);
      if (score != null && score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return null;
    used.add(bestIndex);
    if (previousIndex >= 0 && bestIndex < previousIndex) orderPenalty += 25;
    previousIndex = bestIndex;
    total += bestScore;
  }

  return 350 + total / queryWords.length - orderPenalty;
}

/** Returns a relevance score, or null when the candidate is not close enough. */
export function fuzzyMatchScore(query: string, candidate: string): number | null {
  const q = normalizeSearchText(query);
  const target = normalizeSearchText(candidate);
  if (!q || !target) return null;
  return normalizedMatchScore(q, target);
}

/** Relevance score for a fully-normalized query and candidate. */
export function fuzzyMatchScorePreNormalized(
  normalizedQuery: string,
  normalizedCandidate: string
): number | null {
  if (!normalizedQuery || !normalizedCandidate) return null;
  return normalizedMatchScore(normalizedQuery, normalizedCandidate);
}

function scoreExact(q: string, target: string): number | null {
  return target === q ? 1_000 : null;
}

function scorePrefix(q: string, target: string): number | null {
  return target.startsWith(q) ? 900 - Math.min(120, target.length - q.length) : null;
}

function scoreMultiWord(q: string, target: string): number | null {
  const queryWords = q.split(" ");
  if (queryWords.length <= 1) return null;
  return multiWordScore(queryWords, target);
}

function scoreIncludes(q: string, target: string): number | null {
  return target.includes(q) ? 650 - Math.min(100, target.indexOf(q)) : null;
}

function scoreGapped(q: string, target: string): number | null {
  let queryIndex = 0;
  let gaps = 0;
  let firstMatchAtBoundary = false;
  for (let index = 0; index < target.length; index++) {
    const character = target[index];
    if (character === q[queryIndex]) {
      if (queryIndex === 0) firstMatchAtBoundary = index === 0 || target[index - 1] === " ";
      queryIndex++;
    } else if (queryIndex > 0) gaps++;
    if (queryIndex === q.length) {
      const boundaryBonus = firstMatchAtBoundary ? 40 : 0;
      return 430 - Math.min(180, gaps * 8) + boundaryBonus;
    }
  }
  return null;
}

function scoreLevenshtein(q: string, target: string): number | null {
  if (Math.abs(target.length - q.length) > Math.max(2, Math.floor(q.length / 3))) return null;
  const distance = levenshtein(q, target);
  if (distance > Math.max(1, Math.floor(q.length / 4))) return null;
  return 300 - distance * 35;
}

/** Relevance score for already-normalized query and candidate. */
function normalizedMatchScore(q: string, target: string): number | null {
  return (
    scoreExact(q, target) ??
    scorePrefix(q, target) ??
    scoreMultiWord(q, target) ??
    scoreIncludes(q, target) ??
    (q.length < 3 ? null : (scoreGapped(q, target) ?? scoreLevenshtein(q, target)))
  );
}

function statBoost(value: string, stats: Record<string, SearchQueryStat> | undefined): number {
  const stat = stats?.[normalizeSearchText(value)];
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

function addHistorySuggestions(
  query: string,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  for (const value of options.history ?? []) {
    const match = fuzzyMatchScore(query, value);
    if (match == null) continue;
    put({
      kind: "history",
      score:
        match + statBoost(value, options.queryStats) + statBoost(value, options.suggestionStats),
      subtitle: "history",
      value,
    });
  }
}

function addAnimeSuggestions(
  normalizedQuery: string,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  if (options.scope === "player" || options.scope === "filter") return;
  const normalizedTitles = getNormalizedAnimeTitles(options.animeIndex ?? []);
  for (let index = 0; index < normalizedTitles.length; index++) {
    const anime = options.animeIndex?.[index];
    if (!anime) continue;
    const match = Math.max(
      ...normalizedTitles[index]!.map(
        (title) => fuzzyMatchScorePreNormalized(normalizedQuery, title) ?? -Infinity
      )
    );
    if (!Number.isFinite(match)) continue;
    put({
      kind: "anime",
      score:
        match +
        animeBoost(anime, options.anilistBoost ?? "subtle") +
        statBoost(anime.title, options.suggestionStats),
      subtitle: animeSubtitle(anime),
      value: anime.title,
    });
  }
}

function addExtraSuggestions(
  query: string,
  options: SearchSuggestionOptions,
  put: (s: SearchSuggestion) => void
): void {
  for (const extra of options.extraValues ?? []) {
    const match = fuzzyMatchScore(query, extra.value);
    if (match == null) continue;
    put({
      kind: extra.kind ?? "local",
      score: match + statBoost(extra.value, options.suggestionStats),
      value: extra.value,
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
      const m = fuzzyMatchScorePreNormalized(normalizedQuery, t);
      if (m != null && (best == null || m > best)) best = m;
    }
    if (best == null) continue;
    const stat =
      statBoost(item.title, options.suggestionStats) + statBoost(item.title, options.queryStats);
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
  options: SearchSuggestionOptions,
  put: (suggestion: SearchSuggestion) => void
): void {
  for (const suggestion of options.backendSuggestions ?? []) {
    if (!options.animeEnabled && suggestion.kind === "anime") continue;
    put(suggestion);
  }
  addCollectionSuggestions(normalizedQuery, options, put);
  addHistorySuggestions(query, options, put);
  addAnimeSuggestions(normalizedQuery, options, put);
  addExtraSuggestions(query, options, put);
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
  if (!useSettingsStore.getState().searchSymSpellEnabled) return;
  if (normalizedQuery.length < 3) return;
  const titlesForSymSpell = [
    ...(options.history ?? []),
    ...(options.animeIndex?.map((a) => a.title) ?? []),
    ...(options.extraValues?.map((e) => e.value) ?? []),
  ];
  if (titlesForSymSpell.length === 0) return;
  const sym = buildSymSpellFromTitles(titlesForSymSpell);
  const corrected = sym.suggest(query);
  if (!corrected) return;
  if (normalizeSearchText(corrected) === normalizedQuery) return;
  const cands = getSearchSuggestions(corrected, { ...options, limit: 2 });
  for (const c of cands) {
    put({ ...c, score: c.score - 50, subtitle: `${c.subtitle ?? c.kind} (did you mean)` });
  }
}

function applySemanticFallback(
  query: string,
  normalizedQuery: string,
  options: SearchSuggestionOptions,
  candidates: Map<string, SearchSuggestion>,
  put: (s: SearchSuggestion) => void
): void {
  if (candidates.size !== 0) return;
  if (normalizedQuery.length < 3) return;
  if (!useSettingsStore.getState().searchSemanticEnabled) return;
  const semanticCandidates = [
    ...(options.history ?? []),
    ...(options.animeIndex?.map((a) => a.title) ?? []),
    ...(options.collectionItems?.map((c) => c.title) ?? []),
  ];
  if (semanticCandidates.length === 0) return;
  const limited = semanticCandidates.slice(0, 100);
  for (const value of limited) {
    if (normalizeSearchText(value) === normalizedQuery) continue;
    const s = semanticScore(query, value, semanticCandidates);
    if (s <= 0.25) continue;
    const base = s * 180;
    const boost = statBoost(value, options.suggestionStats) * 0.3;
    put({ kind: "history", score: base + boost, subtitle: "semantic", value });
  }
}

export function getSearchSuggestions(
  query: string,
  options: SearchSuggestionOptions = {}
): SearchSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const limit = Math.max(1, options.limit ?? 8);
  const candidates = new Map<string, SearchSuggestion>();
  const put = (suggestion: SearchSuggestion) => {
    const key = normalizeSearchText(suggestion.value);
    if (!key || key === normalizedQuery) return;
    const current = candidates.get(key);
    if (!current || suggestion.score > current.score) candidates.set(key, suggestion);
  };
  addSuggestionSources(query, normalizedQuery, options, put);
  applySymSpellFallback(query, normalizedQuery, options, limit, candidates, put);
  applySemanticFallback(query, normalizedQuery, options, candidates, put);
  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, limit);
}

/** Inline completion only accepts a prefix, just like editor ghost text. */
export function getInlineCompletion(query: string, suggestions: SearchSuggestion[]): string | null {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return null;
  const suggestion = suggestions.find((item) => {
    const value = normalizeSearchText(item.value);
    return value.startsWith(normalizedQuery) && value !== normalizedQuery;
  });
  return suggestion?.value ?? null;
}
