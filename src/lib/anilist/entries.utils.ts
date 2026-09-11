import {
  ANILIST_GENRES,
  ANILIST_NSFW_TAGS,
  ANILIST_TAGS,
  FORMATS,
  STATUSES,
} from "@/config/anilist/filters.config";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { parseIntent, tokenizeIntent } from "@/lib/search/intent.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniListCollection,
  AniListEntry,
  AniListSort,
  AniMedia,
  AniListFilters,
} from "@/types/anilist";
import type { HexType } from "@/types/color";
import type { TranslationKey } from "@/types/i18n";
import type { NumericCond } from "@/types/search";

export function filterEntries(entries: AniListEntry[], searchTerms: string, global: boolean) {
  return entries.filter((e) => {
    if (!searchTerms.trim() || global) return true;

    const query = searchTerms.toLowerCase();

    return (
      e.media.title.toLowerCase().includes(query) ||
      e.media.titles.some((t) => t.toLowerCase().includes(query))
    );
  });
}

export function sortEntries(
  filtered: AniListEntry[],
  direction: AniListSort["dir"],
  method: AniListSort["key"]
): AniListEntry[] {
  const copy = [...filtered];

  const sortMap = {
    progress: () =>
      copy.sort((a, b) => {
        const d = (b.progress ?? -1) - (a.progress ?? -1);
        return direction === "desc" ? d : -d;
      }),
    score: () =>
      copy.sort((a, b) => {
        const d = (b.media.score ?? -1) - (a.media.score ?? -1);
        return direction === "desc" ? d : -d;
      }),
    myScore: () =>
      copy.sort((a, b) => {
        const d = (b.score ?? -1) - (a.score ?? -1);
        return direction === "desc" ? d : -d;
      }),
    title: () =>
      copy.sort((a, b) => {
        const c = a.media.title.localeCompare(b.media.title);
        return direction === "asc" ? c : -c;
      }),
  } as Record<AniListSort["key"], () => AniListEntry[]>;

  return sortMap[method]();
}

export function getSortingLabel(sort: string): TranslationKey {
  const labelMap: Record<string, TranslationKey> = {
    popularity: "anilist.sort.popularity",
    progress: "anilist.sort.progress",
    relevance: "anilist.sort.relevance",
    score: "anilist.sort.score",
    myScore: "anilist.sort.myScore",
    title: "anilist.sort.title",
    year: "anilist.sort.year",
  };

  return labelMap[sort] ?? toLocaleKey(sort);
}

export function getStatusColor(status: AniListEntry["list_status"]): HexType {
  const statusMap: Record<AniListEntry["list_status"], HexType> = {
    COMPLETED: "#4caf50",
    CURRENT: "#e6b800",
    DROPPED: "#f44336",
    PAUSED: "#ff9800",
    PLANNING: "#2196f3",
    REPEATING: "#9c27b0",
  };

  return statusMap[status] ?? "#888";
}

export function buildEntryLookup(lists: AniListCollection[]) {
  const map = new Map<
    number,
    { progress: number | null; score: number | null; list_status: string }
  >();
  for (const list of lists) {
    for (const e of list.entries) {
      map.set(e.media.id, {
        list_status: e.list_status,
        progress: e.progress,
        score: e.score,
      });
    }
  }
  return map;
}

function emptyToNull<T>(value: T | null | undefined | ""): T | null {
  return value ? (value as T) : null;
}

function arrayToNull<T>(arr: T[]): T[] | null {
  return arr.length > 0 ? arr : null;
}

function rangeStartToNull(pair: [number, number]): number | null {
  return pair[0] > 0 || pair[1] > 0 ? pair[0] : null;
}

function rangeEndToNull(pair: [number, number]): number | null {
  return pair[0] > 0 || pair[1] > 0 ? pair[1] : null;
}

function singlePositiveToNull(pair: [number, number], index: 0 | 1): number | null {
  return pair[index] > 0 ? pair[index] : null;
}

export function searchFiltersToParams(
  filters: AniListFilters,
  query: string | null,
  perPage: number,
  maxPages: number
) {
  return {
    adult: emptyToNull(filters.adult),
    country: emptyToNull(filters.country),
    episodesFrom: rangeStartToNull(filters.episodes),
    episodesTo: rangeEndToNull(filters.episodes),
    format: emptyToNull(filters.format),
    genres: arrayToNull(filters.genres),
    maxPages,
    perPage,
    query,
    scoreFrom: rangeStartToNull(filters.score),
    scoreTo: rangeEndToNull(filters.score),
    season: emptyToNull(filters.season),
    seasonYear: filters.seasonYear,
    sort: filters.sort ? [filters.sort] : null,
    source: emptyToNull(filters.source),
    status: emptyToNull(filters.status),
    tags: arrayToNull(filters.tags),
    yearFrom: singlePositiveToNull(filters.year, 0),
    yearTo: singlePositiveToNull(filters.year, 1),
  };
}

function matchCanonical(list: readonly string[], value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return list.find((candidate) => candidate.toLowerCase() === normalized) ?? null;
}

function applyRangeOp(
  pair: [number, number],
  cond: NumericCond,
  scale: number,
  exclusiveStep: number
): [number, number] {
  const scaled = cond.value * scale;
  if (cond.op === ">" || cond.op === ">=") {
    const bound = cond.op === ">" ? scaled + exclusiveStep : scaled;
    return [pair[0] > 0 ? Math.max(pair[0], bound) : bound, pair[1]];
  }
  if (cond.op === "<" || cond.op === "<=") {
    const bound = cond.op === "<" ? scaled - exclusiveStep : scaled;
    return [pair[0], pair[1] > 0 ? Math.min(pair[1], bound) : bound];
  }
  return pair;
}

export function applyIntentToFilters(
  filters: AniListFilters,
  rawQuery: string
): { filters: AniListFilters; query: string | null } {
  const trimmed = rawQuery.trim();
  if (!useSettingsStore.getState().searchIntentEnabled || !trimmed) {
    return { filters, query: trimmed || null };
  }
  const intent = parseIntent(trimmed);
  const tokens = tokenizeIntent(trimmed);
  const merged: AniListFilters = {
    ...filters,
    episodes: [...filters.episodes] as [number, number],
    genres: [...filters.genres],
    score: [...filters.score] as [number, number],
    tags: [...filters.tags],
    year: [...filters.year] as [number, number],
  };
  const consumed: Array<{ start: number; end: number }> = [];
  const consume = (key: string, op: string, value: string) => {
    for (const token of tokens) {
      if (token.key === key && token.op === op && token.value === value) {
        consumed.push({ start: token.start, end: token.end });
      }
    }
  };

  const applyList = (key: "genre" | "tag", pool: readonly string[], target: "genres" | "tags") => {
    const raw = intent.rawFilters[key];
    if (!raw) return;
    const parts = raw
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const matched = parts.map((part) => matchCanonical(pool, part));
    if (parts.length === 0 || matched.includes(null)) return;
    for (const name of matched) {
      if (name && !merged[target].includes(name)) merged[target].push(name);
    }
    consume(key, "=", raw);
  };
  applyList("genre", ANILIST_GENRES, "genres");
  applyList("tag", filters.adult ? [...ANILIST_TAGS, ...ANILIST_NSFW_TAGS] : ANILIST_TAGS, "tags");

  if (intent.year !== undefined) {
    merged.year = [intent.year, intent.year];
    consume("year", "=", String(intent.year));
  }
  for (const cond of intent.yearOps) {
    if (cond.op === "!=") continue;
    merged.year = applyRangeOp(merged.year, cond, 1, 1);
    consume("year", cond.op, String(cond.value));
  }

  if (intent.rating !== undefined) {
    merged.score = [
      merged.score[0] > 0 ? Math.max(merged.score[0], intent.rating * 10) : intent.rating * 10,
      merged.score[1],
    ];
    consume("rating", "=", String(intent.rating));
  }
  for (const cond of intent.ratingOps) {
    if (cond.op === "!=") continue;
    merged.score = applyRangeOp(merged.score, cond, 10, 10);
    consume("rating", cond.op, String(cond.value));
  }

  if (intent.episodes !== undefined) {
    merged.episodes = [intent.episodes, intent.episodes];
    consume("episodes", "=", String(intent.episodes));
  }
  for (const cond of intent.episodesOps) {
    if (cond.op === "!=") continue;
    merged.episodes = applyRangeOp(merged.episodes, cond, 1, 1);
    consume("episodes", cond.op, String(cond.value));
  }

  const applySingle = (key: "type" | "status", pool: readonly string[]) => {
    const raw = intent.rawFilters[key];
    if (!raw || raw.includes("|")) return;
    const matched = matchCanonical(pool, raw);
    if (!matched) return;
    if (key === "type") merged.format = matched;
    else merged.status = matched;
    consume(key, "=", raw);
  };
  applySingle("type", FORMATS);
  applySingle("status", STATUSES);

  const cuts = [...consumed].sort((a, b) => a.start - b.start);
  let rest = "";
  let pos = 0;
  for (const cut of cuts) {
    if (cut.end <= pos) continue;
    rest += trimmed.slice(pos, cut.start);
    pos = cut.end;
  }
  rest += trimmed.slice(pos);
  return { filters: merged, query: rest.replace(/\s+/g, " ").trim() || null };
}

export function sortAniMediaList(
  results: AniMedia[],
  key: string,
  dir: "asc" | "desc"
): AniMedia[] {
  if (key === "relevance") return results;
  return [...results].sort((a, b) => {
    let cmp = 0;
    if (key === "title") cmp = a.title.localeCompare(b.title);
    else if (key === "score") cmp = (a.score ?? 0) - (b.score ?? 0);
    else if (key === "year") cmp = (a.season_year ?? 0) - (b.season_year ?? 0);
    return dir === "asc" ? cmp : -cmp;
  });
}
