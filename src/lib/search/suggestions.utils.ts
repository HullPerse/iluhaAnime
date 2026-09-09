import { SEARCH_RANKING } from "@/config/search/ranking.config";
import { ANIME_STATUS_BOOST } from "@/config/search/status.config";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AnilistSuggestionBoost,
  SearchAnimeSuggestion,
  SearchQueryStat,
  SearchSuggestion,
  SearchSuggestionOptions,
} from "@/types/search";

import { isTagLikeQuery } from "./intent.utils";
import { normalizeSearchText } from "./normalize.utils";
import { recencyBoost } from "./ranking.utils";
import { fuzzyMatchScore, fuzzyMatchScorePreNormalized } from "./score.utils";
import { buildSymSpellFromTitles, type SymSpell } from "./symspell.utils";

export { fuzzyMatchScore };

export type {
  SearchSuggestion,
  SearchSuggestionKind,
  SearchSuggestionOptions,
} from "@/types/search";

export { normalizeSearchText } from "./normalize.utils";

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
  const base =
    (anime.favourite ? 55 : 0) +
    (anime.hasFavPeople ? 55 : 0) +
    (ANIME_STATUS_BOOST[anime.status] ?? 0) +
    scoreBoost;
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
const symSpellCache = new WeakMap<object, { fingerprint: string; sym: SymSpell }>();

function symSpellFor(titles: string[], basis: object | undefined, fingerprint: string): SymSpell {
  if (!basis) return buildSymSpellFromTitles(titles);
  const hit = symSpellCache.get(basis);
  if (hit && hit.fingerprint === fingerprint) return hit.sym;
  const sym = buildSymSpellFromTitles(titles);
  symSpellCache.set(basis, { fingerprint, sym });
  return sym;
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
  const tagBoost =
    options.scope === "filter" && isTagLikeQuery(query, normalizeSearchText(query))
      ? SEARCH_RANKING.TAG_BOOST
      : 0;
  for (const extra of options.extraValues ?? []) {
    const match = fuzzyMatchScore(query, extra.value);
    if (match == null) continue;
    put({
      kind: extra.kind ?? "local",
      score: match + tagBoost + statBoost(extra.value, options.suggestionStats),
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
  const history = options.history ?? [];
  const extra = options.extraValues?.map((e) => e.value) ?? [];
  const titlesForSymSpell = [
    ...history,
    ...(options.animeIndex?.map((a) => a.title) ?? []),
    ...extra,
  ];
  if (titlesForSymSpell.length === 0) return;
  const basis: object | undefined = options.animeIndex ?? options.history ?? options.extraValues;
  const fingerprint = `${titlesForSymSpell.length}|${history.join("\n")}|${extra.join("\n")}`;
  const sym = symSpellFor(titlesForSymSpell, basis, fingerprint);
  const corrected = sym.suggest(query);
  if (!corrected) return;
  if (normalizeSearchText(corrected) === normalizedQuery) return;
  const cands = getSearchSuggestions(corrected, { ...options, limit: 2 });
  for (const c of cands) {
    put({ ...c, score: c.score - 50, subtitle: `${c.subtitle ?? c.kind} (did you mean)` });
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
  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
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
