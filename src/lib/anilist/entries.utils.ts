import { toLocaleKey } from "@/lib/locale/key.utils";
import type {
  AniListCollection,
  AniListEntry,
  AniListSort,
  AniMedia,
  AniListFilters,
} from "@/types/anilist";
import type { HexType } from "@/types/color";
import type { TranslationKey } from "@/types/i18n";

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

export const listSortKeys: AniListSort["key"][] = [
  "title",
  "score",
  "myScore",
  "progress",
  "completed",
  "release",
  "status",
];
const MEDIA_STATUS_RANK: Record<string, number> = {
  RELEASING: 0,
  FINISHED: 1,
  NOT_YET_RELEASED: 2,
  HIATUS: 3,
  CANCELLED: 4,
};

export const defaultListSortDir: Record<AniListSort["key"], AniListSort["dir"]> = {
  title: "asc",
  score: "desc",
  myScore: "desc",
  progress: "desc",
  completed: "desc",
  release: "desc",
  status: "asc",
};

export function sortEntries(
  filtered: AniListEntry[],
  direction: AniListSort["dir"],
  method: AniListSort["key"]
): AniListEntry[] {
  const copy = [...filtered];
  const valueOf: Record<AniListSort["key"], (entry: AniListEntry) => number | string | null> = {
    progress: (entry) => entry.progress,
    score: (entry) => entry.media.score,
    myScore: (entry) => entry.score,
    title: (entry) => entry.media.title,
    completed: (entry) => entry.completed_at,
    release: (entry) => entry.media.start_date,
    status: (entry) => MEDIA_STATUS_RANK[entry.media.status] ?? null,
  };
  const get = valueOf[method];
  copy.sort((x, y) => {
    const a = get(x);
    const b = get(y);
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    const compared =
      typeof a === "string" ? a.localeCompare(b as string) : (a as number) - (b as number);
    return direction === "desc" ? -compared : compared;
  });
  return copy;
}

export function getSortingLabel(sort: string): TranslationKey {
  const labelMap: Record<string, TranslationKey> = {
    completed: "anilist.sort.completed",
    release: "anilist.sort.release",
    progress: "anilist.sort.progress",
    relevance: "anilist.sort.relevance",
    score: "anilist.sort.score",
    myScore: "anilist.sort.myScore",
    title: "anilist.sort.title",
    status: "anilist.sort.status",
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

export interface EntryListInfo {
  progress: number | null;
  score: number | null;
  list_status: string;
  created_at: number | null;
  updated_at: number | null;
  completed_at: string | null;
  started_at: string | null;
  notes: string | null;
}

export type EntryLookup = Map<number, EntryListInfo>;

export function buildEntryLookup(lists: AniListCollection[]): EntryLookup {
  const map: EntryLookup = new Map();
  for (const list of lists) {
    for (const e of list.entries) {
      map.set(e.media.id, {
        list_status: e.list_status,
        progress: e.progress,
        score: e.score,
        created_at: e.created_at,
        updated_at: e.updated_at,
        completed_at: e.completed_at,
        started_at: e.started_at,
        notes: e.notes,
      });
    }
  }
  return map;
}

function toMs(stamp: number | null): number | null {
  return stamp != null && Number.isFinite(stamp) && stamp > 0 ? stamp * 1000 : null;
}

export function fuzzyDateToTime(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

export function entryListTime(entry: EntryListInfo | undefined): number | null {
  if (!entry) return null;
  if (entry.list_status === "COMPLETED")
    return (
      fuzzyDateToTime(entry.completed_at) ??
      fuzzyDateToTime(entry.started_at) ??
      toMs(entry.created_at) ??
      toMs(entry.updated_at)
    );
  if (entry.list_status === "CURRENT")
    return fuzzyDateToTime(entry.started_at) ?? toMs(entry.created_at) ?? toMs(entry.updated_at);
  return toMs(entry.created_at) ?? toMs(entry.updated_at);
}

export function entryListDate(
  entry: EntryListInfo | undefined,
  locale: string,
  fallback: string | null = null
): string | null {
  if (!entry) return fallback;
  const time = entryListTime(entry);
  return time == null ? fallback : new Date(time).toLocaleDateString(locale);
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
