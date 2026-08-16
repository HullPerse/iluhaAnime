import type {
  AnilistSuggestionBoost,
  SearchAnimeSuggestion,
  SearchQueryStat,
  SearchSuggestion,
  SearchSuggestionOptions,
} from "@/types/search";

export type {
  AnilistSuggestionBoost,
  SearchSuggestion,
  SearchSuggestionKind,
  SearchSuggestionOptions,
} from "@/types/search";

const MAX_QUERY_LENGTH = 200;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/gu, " ")
    .slice(0, MAX_QUERY_LENGTH);
}

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
    Math.abs(targetWord.length - queryWord.length) <=
    Math.max(2, Math.floor(queryWord.length / 3))
  ) {
    const distance = levenshtein(queryWord, targetWord);
    if (distance <= Math.max(1, Math.floor(queryWord.length / 4))) {
      return 70 - distance * 15;
    }
  }

  return null;
}

/** Matches every query word against distinct candidate words, in order. */
function multiWordScore(
  queryWords: string[],
  target: string
): number | null {
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

/** Relevance score for already-normalized query and candidate. */
function normalizedMatchScore(q: string, target: string): number | null {
  if (target === q) return 1_000;
  if (target.startsWith(q)) return 900 - Math.min(120, target.length - q.length);

  const queryWords = q.split(" ");
  if (queryWords.length > 1) {
    const multi = multiWordScore(queryWords, target);
    if (multi != null) return multi;
  }

  if (target.includes(q)) return 650 - Math.min(100, target.indexOf(q));

  if (q.length < 3) return null;

  let queryIndex = 0;
  let gaps = 0;
  let firstMatchAtBoundary = false;
  for (let index = 0; index < target.length; index++) {
    const character = target[index];
    if (character === q[queryIndex]) {
      if (queryIndex === 0) {
        firstMatchAtBoundary =
          index === 0 || target[index - 1] === " ";
      }
      queryIndex++;
    } else if (queryIndex > 0) gaps++;
    if (queryIndex === q.length) {
      const boundaryBonus = firstMatchAtBoundary ? 40 : 0;
      return 430 - Math.min(180, gaps * 8) + boundaryBonus;
    }
  }

  if (Math.abs(target.length - q.length) <= Math.max(2, Math.floor(q.length / 3))) {
    const distance = levenshtein(q, target);
    if (distance <= Math.max(1, Math.floor(q.length / 4))) {
      return 300 - distance * 35;
    }
  }

  return null;
}

function statBoost(
  value: string,
  stats: Record<string, SearchQueryStat> | undefined
): number {
  const stat = stats?.[normalizeSearchText(value)];
  if (!stat) return 0;
  const ageHours = Math.max(0, (Date.now() - stat.lastUsedAt) / 3_600_000);
  const recency = Math.max(0, 60 - Math.min(60, ageHours));
  const ignoredPenalty = Math.min(80, (stat.ignoredCount ?? 0) * 10);
  return (
    Math.min(120, stat.count * 8) +
    recency +
    Math.min(80, stat.selectedCount * 20) -
    ignoredPenalty
  );
}

function animeSubtitle(anime: SearchAnimeSuggestion): string {
  const status = anime.favourite ? "favourite" : anime.status.toLocaleLowerCase();
  const season = [anime.season, anime.seasonYear]
    .filter((value) => value != null && value !== "")
    .join(" ");
  return season ? `${status} · ${season}` : status;
}

function animeBoost(
  anime: SearchAnimeSuggestion,
  boost: AnilistSuggestionBoost
): number {
  if (boost === "off") return 0;
  const statusBoost: Record<string, number> = {
    COMPLETED: 24,
    CURRENT: 42,
    DROPPED: -12,
    FAVOURITE: 52,
    PAUSED: 10,
    PLANNING: 28,
    REPEATING: 38,
  };
  const scoreBoost = anime.score && anime.score > 0 ? anime.score * 2 : 0;
  const base =
    (anime.favourite ? 55 : 0) +
    (statusBoost[anime.status] ?? 0) +
    scoreBoost;
  return boost === "strong" ? base * 1.5 : base;
}

const animeNormalizedTitlesCache = new WeakMap<
  SearchAnimeSuggestion[],
  string[][]
>();

function getNormalizedAnimeTitles(
  animeIndex: SearchAnimeSuggestion[]
): string[][] {
  const cached = animeNormalizedTitlesCache.get(animeIndex);
  if (cached) return cached;
  const titles = animeIndex.map((anime) =>
    [anime.title, ...anime.aliases].map(normalizeSearchText)
  );
  animeNormalizedTitlesCache.set(animeIndex, titles);
  return titles;
}

export function getSearchSuggestions(
  query: string,
  options: SearchSuggestionOptions = {}
): SearchSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const limit = Math.max(1, options.limit ?? 8);
  const candidates = new Map<string, SearchSuggestion>();
  const scope = options.scope;
  const anilistBoost = options.anilistBoost ?? "subtle";
  const put = (suggestion: SearchSuggestion) => {
    const key = normalizeSearchText(suggestion.value);
    if (!key || key === normalizedQuery) return;
    const current = candidates.get(key);
    if (!current || suggestion.score > current.score) candidates.set(key, suggestion);
  };

  for (const suggestion of options.backendSuggestions ?? []) {
    // Backend anime entries come from whoever was last logged into AniList.
    // Without an authenticated profile they would leak another account's list.
    if (!options.animeEnabled && suggestion.kind === "anime") continue;
    put(suggestion);
  }

  for (const value of options.history ?? []) {
    const match = fuzzyMatchScore(query, value);
    if (match == null) continue;
    put({
      kind: "history",
      score: match + statBoost(value, options.queryStats) + statBoost(value, options.suggestionStats),
      subtitle: "history",
      value,
    });
  }

  if (scope !== "player" && scope !== "filter") {
    const normalizedTitles = getNormalizedAnimeTitles(options.animeIndex ?? []);
    for (let index = 0; index < normalizedTitles.length; index++) {
      const anime = options.animeIndex?.[index];
      if (!anime) continue;
      const titles = normalizedTitles[index];
      let match = -Infinity;
      for (const title of titles) {
        const score = fuzzyMatchScorePreNormalized(normalizedQuery, title);
        if (score != null && score > match) match = score;
      }
      if (!Number.isFinite(match)) continue;
      put({
        kind: "anime",
        score:
          match +
          animeBoost(anime, anilistBoost) +
          statBoost(anime.title, options.suggestionStats),
        subtitle: animeSubtitle(anime),
        value: anime.title,
      });
    }
  }

  for (const extra of options.extraValues ?? []) {
    const match = fuzzyMatchScore(query, extra.value);
    if (match == null) continue;
    put({
      kind: extra.kind ?? "local",
      score: match + statBoost(extra.value, options.suggestionStats),
      value: extra.value,
    });
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, limit);
}

/** Inline completion only accepts a prefix, just like editor ghost text. */
export function getInlineCompletion(
  query: string,
  suggestions: SearchSuggestion[]
): string | null {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return null;
  const suggestion = suggestions.find((item) => {
    const value = normalizeSearchText(item.value);
    return value.startsWith(normalizedQuery) && value !== normalizedQuery;
  });
  return suggestion?.value ?? null;
}
