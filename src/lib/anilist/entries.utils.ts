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
