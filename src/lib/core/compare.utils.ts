import {
  COMPARE_HIGH_CONFIDENCE_SCORED,
  COMPARE_LOW_CONFIDENCE_SCORED,
  COMPARE_MIN_DIRECTION_PAIRS,
  COMPARE_MIN_RANK_SAMPLES,
  COMPARE_VERDICT_THRESHOLDS,
  COMPARE_WEIGHTS,
} from "@/config/anilist/compare.config";
import { normalizeToTen } from "@/lib/anilist/anilistScore.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { AniListCollection, AniListEntry, FavouriteAnime } from "@/types/anilist/anilist";
import type {
  CompareConfidence,
  CompareDiffKind,
  CompareMetric,
  CompareSort,
  CompareSummary,
  CompareVerdict,
  ComparedTitle,
  GenreOverlap,
  GenreTaste,
  TasteMatch,
} from "@/types/core/compare";

export const COMPARE_METRICS: readonly CompareMetric[] = ["iluha", "mal", "delta"];

export const COMPARE_SORTS: readonly CompareSort[] = ["gap", "close", "title", "mine", "friend"];

const MIN_SHARED_FOR_CONFIDENCE = COMPARE_LOW_CONFIDENCE_SCORED;
const ILUHA_DELTA_WEIGHT = 0.7;
const ILUHA_PEARSON_WEIGHT = 0.3;

export function normalizeScoreToHundred(
  score: number | null | undefined,
  format: AnilistScoreFormat
): number | null {
  const ten = normalizeToTen(score, format);
  return ten == null ? null : Math.round(ten * 100) / 10;
}

export function pearsonCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
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

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array.from({ length: values.length }, () => 0);
  let start = 0;
  while (start < order.length) {
    const first = order[start];
    if (!first) break;
    let end = start;
    while (end + 1 < order.length) {
      const next = order[end + 1];
      if (!next || next.value !== first.value) break;
      end += 1;
    }
    const rank = (start + end + 2) / 2;
    for (let index = start; index <= end; index += 1) {
      const item = order[index];
      if (item) ranks[item.index] = rank;
    }
    start = end + 1;
  }
  return ranks;
}

export function spearmanCorrelation(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < COMPARE_MIN_RANK_SAMPLES) return null;
  return pearsonCorrelation(averageRanks(xs), averageRanks(ys));
}

export function meanAbsoluteGap(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length === 0) return null;
  let total = 0;
  for (let index = 0; index < xs.length; index += 1) {
    total += Math.abs((xs[index] as number) - (ys[index] as number));
  }
  return round1(total / xs.length);
}

export function compareConfidence(count: number): CompareConfidence {
  if (count <= 0) return "none";
  if (count < COMPARE_LOW_CONFIDENCE_SCORED) return "low";
  if (count < COMPARE_HIGH_CONFIDENCE_SCORED) return "medium";
  return "high";
}

interface DirectionAgreement {
  score: number | null;
  agree: number;
  split: number;
  neutral: number;
}

function directionAgreement(
  mine: readonly number[],
  friend: readonly number[]
): DirectionAgreement {
  let agree = 0;
  let split = 0;
  let neutral = 0;
  const mineMean = mean(mine);
  const friendMean = mean(friend);
  for (let index = 0; index < mine.length; index += 1) {
    const mineSide = (mine[index] as number) - mineMean;
    const friendSide = (friend[index] as number) - friendMean;
    if (Math.abs(mineSide) < 0.05 || Math.abs(friendSide) < 0.05) {
      neutral += 1;
    } else if (mineSide > 0 === friendSide > 0) {
      agree += 1;
    } else {
      split += 1;
    }
  }
  const decisive = agree + split;
  return {
    score: decisive >= COMPARE_MIN_DIRECTION_PAIRS ? Math.round((agree / decisive) * 100) : null,
    agree,
    split,
    neutral,
  };
}

function emptyTaste(count: number): TasteMatch {
  return {
    score: null,
    gapScore: null,
    rankScore: null,
    directionScore: null,
    spearman: null,
    confidence: compareConfidence(count),
    scoredCount: count,
    agree: 0,
    split: 0,
    neutral: 0,
  };
}

export function buildTasteMatch(mine: readonly number[], friend: readonly number[]): TasteMatch {
  if (mine.length !== friend.length || mine.length === 0) return emptyTaste(0);
  const count = mine.length;
  const meanGap = meanAbsoluteGap(mine, friend);
  const gapScore = meanGap == null ? null : Math.round(100 - meanGap);
  const spearman = spearmanCorrelation(mine, friend);
  const rankScore = spearman == null ? null : Math.round((spearman + 1) * 50);
  const direction = directionAgreement(mine, friend);
  const parts: { value: number | null; weight: number }[] = [
    { value: gapScore, weight: COMPARE_WEIGHTS.gap },
    { value: rankScore, weight: COMPARE_WEIGHTS.rank },
    { value: direction.score, weight: COMPARE_WEIGHTS.direction },
  ];
  const available = parts.filter((part) => part.value != null);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  const score =
    totalWeight > 0
      ? Math.round(
          available.reduce((sum, part) => sum + (part.value ?? 0) * part.weight, 0) / totalWeight
        )
      : null;
  return {
    score,
    gapScore,
    rankScore,
    directionScore: direction.score,
    spearman,
    confidence: compareConfidence(count),
    scoredCount: count,
    agree: direction.agree,
    split: direction.split,
    neutral: direction.neutral,
  };
}

export function compareVerdict(score: number | null): CompareVerdict {
  if (score == null) return "unknown";
  if (score >= COMPARE_VERDICT_THRESHOLDS.identical) return "identical";
  if (score >= COMPARE_VERDICT_THRESHOLDS.close) return "close";
  if (score >= COMPARE_VERDICT_THRESHOLDS.mixed) return "mixed";
  return "opposite";
}

export function metricScore(metric: CompareMetric, summary: CompareSummary): number | null {
  if (metric === "delta") return summary.deltaScore;
  if (metric === "iluha") return summary.iluhaAffinity;
  return summary.malAffinity;
}

export function formatNormalizedScore(score: number | null): string {
  if (score == null) return "-";
  return (score / 10).toFixed(1);
}

export function formatSignedDelta(delta: number | null): string {
  if (delta == null) return "-";
  const value = delta / 10;
  if (Math.abs(value) < 0.05) return "0.0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function formatSignedPercent(value: number | null): string {
  if (value == null) return "-";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function compareDiff(gap: number | null, threshold: number): CompareDiffKind {
  if (gap == null) return "unknown";
  if (gap <= 0.05) return "same";
  return gap <= threshold ? "close" : "far";
}

interface ComparedScores {
  mine: number | null;
  mineRaw: number | null;
  friend: number | null;
  friendRaw: number | null;
  delta: number | null;
  signedDelta: number | null;
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
  const signedDelta = myScore != null && friendScore != null ? myScore - friendScore : null;
  return {
    mine: myScore,
    mineRaw,
    friend: friendScore,
    friendRaw,
    delta: signedDelta == null ? null : Math.abs(signedDelta),
    signedDelta,
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
    titles: media?.titles ?? [],
    coverUrl: media?.cover_url ?? null,
    episodes: media?.episodes ?? null,
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
  const mineScores = scored.map((row) => row.mine as number);
  const friendScores = scored.map((row) => row.friend as number);
  const meanDelta = meanAbsoluteGap(mineScores, friendScores);
  const pearson = scored.length >= 2 ? pearsonCorrelation(mineScores, friendScores) : null;
  const union = shared.length + onlyMine.length + onlyFriend.length;
  const libraryOverlap = union > 0 ? Math.round((shared.length / union) * 100) : null;
  const taste = buildTasteMatch(mineScores, friendScores);
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
    libraryOverlap,
    taste,
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

interface GenreAverage {
  sum: number;
  count: number;
}

function genreAverages(
  lists: AniListCollection[],
  format: AnilistScoreFormat
): Map<string, GenreAverage> {
  const averages = new Map<string, GenreAverage>();
  for (const list of lists) {
    for (const entry of list.entries) {
      const score = normalizeScoreToHundred(entry.score, format);
      if (score == null) continue;
      for (const genre of entry.media.genres) {
        const current = averages.get(genre) ?? { sum: 0, count: 0 };
        current.sum += score;
        current.count += 1;
        averages.set(genre, current);
      }
    }
  }
  return averages;
}

export function topGenreTaste(
  mine: AniListCollection[],
  friend: AniListCollection[],
  myFormat: AnilistScoreFormat,
  friendFormat: AnilistScoreFormat,
  limit = 5
): GenreTaste[] {
  const mineAverages = genreAverages(mine, myFormat);
  const friendAverages = genreAverages(friend, friendFormat);
  const rows: GenreTaste[] = [];
  for (const [genre, mineAverage] of mineAverages) {
    const friendAverage = friendAverages.get(genre);
    if (!friendAverage || friendAverage.count === 0 || mineAverage.count === 0) continue;
    const mineScore = round1(mineAverage.sum / mineAverage.count);
    const friendScore = round1(friendAverage.sum / friendAverage.count);
    rows.push({
      genre,
      mine: mineScore,
      friend: friendScore,
      mineCount: mineAverage.count,
      friendCount: friendAverage.count,
      delta: round1(mineScore - friendScore),
    });
  }
  rows.sort(
    (a, b) =>
      b.mineCount + b.friendCount - (a.mineCount + a.friendCount) ||
      Math.abs(b.delta) - Math.abs(a.delta) ||
      a.genre.localeCompare(b.genre)
  );
  return rows.slice(0, limit);
}

export function filterCompareRows(rows: readonly ComparedTitle[], query: string): ComparedTitle[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...rows];
  return rows.filter(
    (row) =>
      row.title.toLowerCase().includes(normalized) ||
      row.titles.some((title) => title.toLowerCase().includes(normalized))
  );
}

function compareNullableDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function compareNullableAsc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function sortCompareRows(
  rows: readonly ComparedTitle[],
  sort: CompareSort
): ComparedTitle[] {
  return [...rows].sort((a, b) => {
    if (sort === "gap") {
      const byGap = compareNullableDesc(a.delta, b.delta);
      return byGap !== 0 ? byGap : a.title.localeCompare(b.title);
    }
    if (sort === "close") {
      const byGap = compareNullableAsc(a.delta, b.delta);
      return byGap !== 0 ? byGap : a.title.localeCompare(b.title);
    }
    if (sort === "mine") {
      const byScore = compareNullableDesc(a.mine, b.mine);
      return byScore !== 0 ? byScore : a.title.localeCompare(b.title);
    }
    if (sort === "friend") {
      const byScore = compareNullableDesc(a.friend, b.friend);
      return byScore !== 0 ? byScore : a.title.localeCompare(b.title);
    }
    return a.title.localeCompare(b.title);
  });
}

export function sharedFavourites(
  mine: FavouriteAnime[],
  friend: FavouriteAnime[]
): FavouriteAnime[] {
  const ids = new Set(friend.map((item) => item.id));
  return mine.filter((item) => ids.has(item.id));
}
