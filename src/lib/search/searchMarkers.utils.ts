import type { ParsedTitleAttributes } from "@/types/search/searchResolve";

export const MAX_SEASON = 50;
export const MAX_EPISODE_AMBIGUOUS = 1500;

const YEAR_RE = /(^|\s)\(?((?:19|20)\d{2})\)?(?=\s|$)/;
const SEASON_RE =
  /(^|\s)(?:s(\d{1,2})|season\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+season)(?=\s|$)/i;
const EPISODE_RE = /(^|\s)(?:e(\d{1,4})|ep(?:isode)?\s*(\d{1,4})|第(\d{1,4})話)(?=\s|$)/i;

function firstGroup(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  for (let index = 2; index < match.length; index++) {
    const raw = match[index];
    if (raw !== undefined && raw !== "") {
      const value = Number(raw);
      if (Number.isInteger(value)) return value;
    }
  }
  return null;
}

function stripFirst(
  query: string,
  pattern: RegExp
): { rest: string; removed: string; match: RegExpMatchArray } | null {
  const match = query.match(pattern);
  if (!match || match.index === undefined) return null;
  const prefix = match[1] ?? "";
  const start = match.index + prefix.length;
  const end = match.index + match[0].length;
  const removed = query.slice(start, end);
  const rest = `${query.slice(0, start)} ${query.slice(end)}`.replace(/\s+/g, " ").trim();
  return { match, removed, rest };
}

function isFilterValue(query: string, match: RegExpMatchArray | null): boolean {
  if (!match || match.index === undefined) return false;
  const before = query.slice(0, match.index).trimEnd();
  return /(?:year|date)\s*(?:~=|>=|<=|!=|=|>|<)\s*$/i.test(before);
}

export function romanToInt(value: string): number | null {
  const word = value.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(word)) return null;
  const table: Record<string, number> = { C: 100, D: 500, I: 1, L: 50, M: 1000, V: 5, X: 10 };
  let total = 0;
  let previous = 0;
  for (let index = word.length - 1; index >= 0; index--) {
    const current = table[word[index] ?? ""] ?? 0;
    total = current < previous ? total - current : total + current;
    previous = current;
  }
  return total > 0 ? total : null;
}

export function parseTitleAttributes(query: string): ParsedTitleAttributes {
  const empty: ParsedTitleAttributes = {
    episode: null,
    explicit: false,
    markers: [],
    remainder: query.trim(),
    season: null,
    year: null,
  };
  const trimmed = query.trim();
  if (!trimmed) return empty;
  let rest = trimmed;
  let explicit = false;
  let year: number | null = null;
  const markers: string[] = [];

  const yearFound = stripFirst(rest, YEAR_RE);
  const yearCandidate = yearFound ? firstGroup(yearFound.match) : null;
  if (yearFound && yearCandidate !== null && !isFilterValue(rest, yearFound.match)) {
    year = yearCandidate;
    markers.push(yearFound.removed);
    rest = yearFound.rest;
    explicit = true;
  }

  const seasonFound = stripFirst(rest, SEASON_RE);
  const seasonCandidate = seasonFound ? firstGroup(seasonFound.match) : null;
  const season =
    seasonCandidate !== null && seasonCandidate >= 1 && seasonCandidate <= MAX_SEASON
      ? seasonCandidate
      : null;
  if (seasonFound && season !== null) {
    markers.push(seasonFound.removed);
    rest = seasonFound.rest;
    explicit = true;
  }

  const episodeFound = stripFirst(rest, EPISODE_RE);
  const episodeCandidate = episodeFound ? firstGroup(episodeFound.match) : null;
  const episode = episodeCandidate !== null && episodeCandidate >= 0 ? episodeCandidate : null;
  if (episodeFound && episode !== null) {
    markers.push(episodeFound.removed);
    rest = episodeFound.rest;
    explicit = true;
  }

  return { episode, explicit, markers, remainder: rest.trim(), season, year };
}
