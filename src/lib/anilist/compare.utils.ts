import { normalizeToTen, type AnilistScoreFormat } from "@/lib/anilist/score.utils";
import type { AniListCollection, AniListEntry, FavouriteAnime } from "@/types/anilist";

export type CompareMetric = "iluha" | "mal" | "delta";

export const COMPARE_METRICS: readonly CompareMetric[] = ["iluha", "mal", "delta"];

export const MIN_SHARED_FOR_CONFIDENCE = 5;
const ILUHA_DELTA_WEIGHT = 0.7;
const ILUHA_PEARSON_WEIGHT = 0.3;

export interface ComparedTitle {
  id: number;
  title: string;
  coverUrl: string | null;
  mine: number | null;
  mineRaw: number | null;
  friend: number | null;
  friendRaw: number | null;
  delta: number | null;
  myStatus: string;
  friendStatus: string;
  myProgress: number | null;
  friendProgress: number | null;
}

export interface CompareSummary {
  shared: ComparedTitle[];
  onlyMine: ComparedTitle[];
  onlyFriend: ComparedTitle[];
  sharedScoredCount: number;
  meanDelta: number | null;
  pearson: number | null;
  malAffinity: number | null;
  deltaScore: number | null;
  iluhaAffinity: number | null;
  lowConfidence: boolean;
}

export interface GenreOverlap {
  genre: string;
  mine: number;
  friend: number;
}

export function normalizeScoreToHundred(
  score: number | null | undefined,
  format: AnilistScoreFormat
): number | null {
  const ten = normalizeToTen(score, format);
  return ten == null ? null : Math.round(ten * 100) / 10;
}

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i] as number;
    sumY += ys[i] as number;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const x = (xs[i] as number) - meanX;
    const y = (ys[i] as number) - meanY;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  if (dx === 0 || dy === 0) return null;
  const r = num / Math.sqrt(dx * dy);
  if (r > 1) return 1;
  if (r < -1) return -1;
  return r;
}

interface ComparedScores {
  mine: number | null;
  mineRaw: number | null;
  friend: number | null;
  friendRaw: number | null;
  delta: number | null;
}

function comparedScores(
  mine: AniListEntry | undefined,
  friend: AniListEntry | undefined,
  myFormat: AnilistScoreFormat,
  friendFormat: AnilistScoreFormat
): ComparedScores {
  const mineRaw = mine?.score ?? null;
  const friendRaw = friend?.score ?? null;
  const myScore = mine ? normalizeScoreToHundred(mine.score, myFormat) : null;
  const friendScore = friend ? normalizeScoreToHundred(friend.score, friendFormat) : null;
  return {
    mine: myScore,
    mineRaw,
    friend: friendScore,
    friendRaw,
    delta: myScore != null && friendScore != null ? Math.abs(myScore - friendScore) : null,
  };
}

function toCompared(
  id: number,
  mine: AniListEntry | undefined,
  friend: AniListEntry | undefined,
  myFormat: AnilistScoreFormat,
  friendFormat: AnilistScoreFormat
): ComparedTitle {
  const scores = comparedScores(mine, friend, myFormat, friendFormat);
  const media = (mine ?? friend)?.media;
  return {
    id,
    title: media?.title ?? `#${id}`,
    coverUrl: media?.cover_url ?? null,
    ...scores,
    myStatus: mine?.list_status ?? "",
    friendStatus: friend?.list_status ?? "",
    myProgress: mine?.progress ?? null,
    friendProgress: friend?.progress ?? null,
  };
}

function indexEntries(lists: AniListCollection[]): Map<number, AniListEntry> {
  const map = new Map<number, AniListEntry>();
  for (const list of lists) {
    for (const entry of list.entries) {
      if (!map.has(entry.media.id)) map.set(entry.media.id, entry);
    }
  }
  return map;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildCompareSummary(
  mine: AniListCollection[],
  friend: AniListCollection[],
  myFormat: AnilistScoreFormat,
  friendFormat: AnilistScoreFormat
): CompareSummary {
  const myIndex = indexEntries(mine);
  const friendIndex = indexEntries(friend);
  const shared: ComparedTitle[] = [];
  const onlyMine: ComparedTitle[] = [];
  const onlyFriend: ComparedTitle[] = [];
  for (const [id, friendEntry] of friendIndex) {
    const myEntry = myIndex.get(id);
    if (myEntry) shared.push(toCompared(id, myEntry, friendEntry, myFormat, friendFormat));
    else onlyFriend.push(toCompared(id, undefined, friendEntry, myFormat, friendFormat));
    myIndex.delete(id);
  }
  for (const [id, myEntry] of myIndex) {
    onlyMine.push(toCompared(id, myEntry, undefined, myFormat, friendFormat));
  }
  const scored = shared.filter((row) => row.mine != null && row.friend != null);
  const deltas = scored.map((row) => row.delta as number);
  const meanDelta =
    deltas.length > 0 ? round1(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;
  const pearson =
    scored.length >= 2
      ? pearsonCorrelation(
          scored.map((row) => row.mine as number),
          scored.map((row) => row.friend as number)
        )
      : null;
  const empty: CompareSummary = {
    shared: sortShared(shared),
    onlyMine: sortByTitle(onlyMine),
    onlyFriend: sortByTitle(onlyFriend),
    sharedScoredCount: scored.length,
    meanDelta,
    pearson,
    malAffinity: null,
    deltaScore: null,
    iluhaAffinity: null,
    lowConfidence: scored.length < MIN_SHARED_FOR_CONFIDENCE,
  };
  if (meanDelta == null) return empty;
  const deltaScore = round1(100 - meanDelta);
  const pearsonScore = pearson == null ? null : Math.round(((pearson + 1) / 2) * 100);
  const iluha =
    pearsonScore == null
      ? deltaScore
      : Math.round(ILUHA_DELTA_WEIGHT * deltaScore + ILUHA_PEARSON_WEIGHT * pearsonScore);
  return {
    ...empty,
    malAffinity: pearson == null ? null : Math.round(pearson * 100),
    deltaScore,
    iluhaAffinity: iluha,
  };
}

function sortShared(rows: ComparedTitle[]): ComparedTitle[] {
  return [...rows].sort((a, b) => {
    if (a.delta == null && b.delta == null) return a.title.localeCompare(b.title);
    if (a.delta == null) return 1;
    if (b.delta == null) return -1;
    if (b.delta !== a.delta) return b.delta - a.delta;
    return a.title.localeCompare(b.title);
  });
}

function sortByTitle(rows: ComparedTitle[]): ComparedTitle[] {
  return [...rows].sort((a, b) => a.title.localeCompare(b.title));
}

export function topGenreOverlap(
  mine: AniListCollection[],
  friend: AniListCollection[],
  limit = 5
): GenreOverlap[] {
  const myCounts = countGenres(mine);
  const friendCounts = countGenres(friend);
  const rows: GenreOverlap[] = [];
  for (const [genre, count] of myCounts) {
    const other = friendCounts.get(genre);
    if (other != null && other > 0) rows.push({ genre, mine: count, friend: other });
  }
  rows.sort((a, b) => b.mine + b.friend - (a.mine + a.friend) || a.genre.localeCompare(b.genre));
  return rows.slice(0, limit);
}

function countGenres(lists: AniListCollection[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const entry of list.entries) {
      for (const genre of entry.media.genres) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function sharedFavourites(
  mine: FavouriteAnime[],
  friend: FavouriteAnime[]
): FavouriteAnime[] {
  const ids = new Set(friend.map((item) => item.id));
  return mine.filter((item) => ids.has(item.id));
}
