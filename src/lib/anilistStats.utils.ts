import {
  STATS_COMPLETION_GENRE_LIMIT,
  STATS_GENRE_LIMIT,
  STATS_MIN_GENRE_SAMPLE,
  STATS_STARTED_STATUSES,
  STATS_STATUS_ORDER,
  STATS_STUDIO_LIMIT,
} from "@/config/stats.config";
import { collectAllEntries } from "@/lib/anilistGroup.utils";
import { formatMeanScore, scoreFormatMax } from "@/lib/anilistScore.utils";
import type { AnilistScoreFormat } from "@/types/anilistScore";
import { clamp } from "@/lib/math.utils";
import type { AniListCollection, AniListStatistics } from "@/types/anilist";
import type {
  StatsGenreCompletion,
  StatsMediaRow,
  StatsOverviewModel,
  StatsScoreBlock,
  StatsStatusRow,
} from "@/types/anilistStats";

const STARTED = new Set<string>(STATS_STARTED_STATUSES);
const STATUS_RANK = new Map<string, number>(
  STATS_STATUS_ORDER.map((status, index) => [status, index])
);

function byStatusRank(left: StatsStatusRow, right: StatsStatusRow): number {
  const leftRank = STATUS_RANK.get(left.status) ?? STATUS_RANK.size;
  const rightRank = STATUS_RANK.get(right.status) ?? STATUS_RANK.size;
  return leftRank === rightRank ? right.count - left.count : leftRank - rightRank;
}

function byCountThenName<T extends { count: number }>(
  left: T,
  right: T,
  name: (row: T) => string
): number {
  return right.count === left.count
    ? name(left).localeCompare(name(right))
    : right.count - left.count;
}

function scoreWidth(format: AnilistScoreFormat): number {
  if (format === "POINT_10_DECIMAL") return 0.5;
  return scoreFormatMax(format) > 10 ? 5 : 1;
}

function buildScoreBlock(
  statistics: AniListStatistics,
  format: AnilistScoreFormat
): StatsScoreBlock {
  const max = scoreFormatMax(format);
  const width = scoreWidth(format);
  const count = Math.round(max / width);
  const buckets = Array.from({ length: count }, (_, index) => ({
    key: `score-${index}`,
    label: String((index + 1) * width),
    from: index * width,
    to: (index + 1) * width,
    count: 0,
  }));
  for (const entry of statistics.scores) {
    if (entry.score <= 0) continue;
    const index = clamp(Math.ceil(entry.score / width) - 1, 0, count - 1);
    buckets[index]!.count += entry.count;
  }
  return {
    buckets,
    mean: statistics.mean_score,
    sigma: statistics.standard_deviation,
    max,
  };
}

function completionFromStatistics(statistics: AniListStatistics): {
  rate: number | null;
  completed: number;
  started: number;
} {
  let completed = 0;
  let started = 0;
  for (const row of statistics.statuses) {
    if (row.status === "PLANNING") continue;
    started += row.count;
    if (row.status === "COMPLETED") completed += row.count;
  }
  return {
    rate: started > 0 ? completed / started : null,
    completed,
    started,
  };
}

let cachedOverview: {
  statistics: AniListStatistics;
  lists: AniListCollection[];
  scoreFormat: AnilistScoreFormat;
  result: StatsOverviewModel;
} | null = null;

export function buildStatsOverview({
  statistics,
  lists,
  scoreFormat,
}: {
  statistics: AniListStatistics;
  lists: AniListCollection[];
  scoreFormat: AnilistScoreFormat;
}): StatsOverviewModel {
  if (
    cachedOverview?.statistics === statistics &&
    cachedOverview?.lists === lists &&
    cachedOverview?.scoreFormat === scoreFormat
  ) {
    return cachedOverview.result;
  }
  const completion = completionFromStatistics(statistics);
  const model = {
    isEmpty: statistics.count === 0,
    kpi: {
      titles: statistics.count,
      episodes: statistics.episodes_watched,
      hours: Math.round(statistics.minutes_watched / 60),
      mean: statistics.mean_score,
      meanLabel: formatMeanScore(statistics.mean_score, scoreFormat),
      completionRate: completion.rate,
      completed: completion.completed,
      started: completion.started,
    },
    scores: buildScoreBlock(statistics, scoreFormat),
    statuses: statistics.statuses
      .map((row) => ({ status: row.status, count: row.count }))
      .sort(byStatusRank),
    formats: statistics.formats
      .map((row) => ({ format: row.format, count: row.count, mediaIds: row.media_ids }))
      .sort((left, right) => byCountThenName(left, right, (row) => row.format)),
    startYears: statistics.start_years
      .map((row) => ({ year: row.year, count: row.count, mediaIds: row.media_ids }))
      .sort((left, right) => left.year - right.year),
    releaseYears: statistics.release_years
      .map((row) => ({ year: row.year, count: row.count, mediaIds: row.media_ids }))
      .sort((left, right) => left.year - right.year),
    genres: statistics.genres
      .map((row) => ({
        genre: row.genre,
        count: row.count,
        meanScore: row.mean_score,
        minutes: row.minutes_watched,
        mediaIds: row.media_ids,
      }))
      .sort((left, right) => byCountThenName(left, right, (row) => row.genre))
      .slice(0, STATS_GENRE_LIMIT),
    studios: statistics.studios
      .map((row) => ({
        id: row.id,
        name: row.name,
        count: row.count,
        mediaIds: row.media_ids,
      }))
      .sort((left, right) => byCountThenName(left, right, (row) => row.name))
      .slice(0, STATS_STUDIO_LIMIT),
    completion: buildGenreCompletion(lists),
  };
  cachedOverview = { statistics, lists, scoreFormat, result: model };
  return model;
}

let cachedGenreCompletion: {
  lists: AniListCollection[];
  result: StatsGenreCompletion[];
} | null = null;

function buildGenreCompletion(lists: AniListCollection[]): StatsGenreCompletion[] {
  if (cachedGenreCompletion?.lists === lists) {
    return cachedGenreCompletion.result;
  }
  const entries = collectAllEntries(lists);
  const counts = new Map<string, { started: number; completed: number }>();
  for (const entry of entries) {
    if (!STARTED.has(entry.list_status)) continue;
    for (const genre of entry.media.genres) {
      const row = counts.get(genre) ?? { started: 0, completed: 0 };
      row.started += 1;
      if (entry.list_status === "COMPLETED") row.completed += 1;
      counts.set(genre, row);
    }
  }
  const result = [...counts.entries()]
    .filter(([, row]) => row.started >= STATS_MIN_GENRE_SAMPLE)
    .map(([genre, row]) => ({
      genre,
      started: row.started,
      completed: row.completed,
      rate: row.completed / row.started,
    }))
    .sort((left, right) => right.started - left.started || right.rate - left.rate)
    .slice(0, STATS_COMPLETION_GENRE_LIMIT);
  cachedGenreCompletion = { lists, result };
  return result;
}

let cachedMediaRows: {
  mediaIds: readonly number[];
  lists: AniListCollection[];
  result: StatsMediaRow[];
} | null = null;

export function buildMediaRows(
  mediaIds: readonly number[],
  lists: AniListCollection[]
): StatsMediaRow[] {
  if (cachedMediaRows?.mediaIds === mediaIds && cachedMediaRows?.lists === lists) {
    return cachedMediaRows.result;
  }
  const byId = new Map(collectAllEntries(lists).map((entry) => [entry.media.id, entry]));
  const seen = new Set<number>();
  const rows: StatsMediaRow[] = [];
  for (const id of mediaIds) {
    if (seen.has(id)) continue;
    const entry = byId.get(id);
    if (!entry) continue;
    seen.add(id);
    rows.push({
      id,
      title: entry.media.title,
      coverUrl: entry.media.cover_url,
      score: entry.score,
      progress: entry.progress,
      episodes: entry.media.episodes,
      status: entry.list_status,
    });
  }
  cachedMediaRows = { mediaIds, lists, result: rows };
  return rows;
}
