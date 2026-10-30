export interface StatsKpi {
  titles: number;
  episodes: number;
  hours: number;
  mean: number;
  meanLabel: string | null;
  completionRate: number | null;
  completed: number;
  started: number;
}

export interface StatsScoreBucket {
  key: string;
  label: string;
  from: number;
  to: number;
  count: number;
}

export interface StatsScoreBlock {
  buckets: StatsScoreBucket[];
  mean: number;
  sigma: number;
  max: number;
}

export interface StatsStatusRow {
  status: string;
  count: number;
}

export interface StatsFormatRow {
  format: string;
  count: number;
  mediaIds: number[];
}

export interface StatsYearRow {
  year: number;
  count: number;
  mediaIds: number[];
}

export interface StatsGenreRow {
  genre: string;
  count: number;
  meanScore: number;
  minutes: number;
  mediaIds: number[];
}

export interface StatsStudioRow {
  id: number;
  name: string;
  count: number;
  mediaIds: number[];
}

export interface StatsGenreCompletion {
  genre: string;
  started: number;
  completed: number;
  rate: number;
}

export interface StatsMediaRow {
  id: number;
  title: string;
  coverUrl: string | null;
  score: number | null;
  progress: number | null;
  episodes: number | null;
  status: string;
}

export interface StatsOverviewModel {
  isEmpty: boolean;
  kpi: StatsKpi;
  scores: StatsScoreBlock;
  statuses: StatsStatusRow[];
  formats: StatsFormatRow[];
  startYears: StatsYearRow[];
  releaseYears: StatsYearRow[];
  genres: StatsGenreRow[];
  studios: StatsStudioRow[];
  completion: StatsGenreCompletion[];
}
