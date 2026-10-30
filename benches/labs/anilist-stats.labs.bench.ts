import { bench, group } from "@pmndrs/labs";

import { buildMediaRows, buildStatsOverview } from "@/lib/anilistStats.utils";
import { collectAllEntries } from "@/lib/anilistGroup.utils";
import type { AniListCollection, AniListEntry, AniListStatistics } from "../../src/types/anilist";

const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
];

const STATUSES = ["COMPLETED", "CURRENT", "PLANNING", "DROPPED", "PAUSED", "REPEATING"];

function entry(id: number): AniListEntry {
  return {
    media: {
      id,
      title: `Title ${id}`,
      genres: [GENRES[id % GENRES.length]!, GENRES[(id * 3) % GENRES.length]!],
    } as unknown as AniListEntry["media"],
    progress: id % 24,
    score: 70 + (id % 30),
    list_status: STATUSES[id % STATUSES.length]!,
    created_at: null,
    completed_at: null,
    started_at: null,
    updated_at: null,
    notes: null,
    repeat: 0,
    custom_lists: [],
  };
}

const ENTRIES = Array.from({ length: 3000 }, (_, index) => entry(index + 1));
const LISTS: AniListCollection[] = [
  { name: "Watching", entries: ENTRIES.slice(0, 1500) },
  { name: "Completed", entries: ENTRIES.slice(1500) },
  { name: "Custom", entries: ENTRIES.slice(0, 300) },
];

const STATISTICS: AniListStatistics = {
  count: 3000,
  mean_score: 78.4,
  standard_deviation: 11.2,
  minutes_watched: 900_000,
  episodes_watched: 36_000,
  statuses: STATUSES.map((status) => ({
    status,
    count: 3000 / 6,
    minutes_watched: 150_000,
  })),
  scores: Array.from({ length: 10 }, (_, index) => ({
    score: index + 1,
    count: 300,
  })),
  formats: ["TV", "MOVIE", "OVA", "ONA", "SPECIAL"].map((format, index) => ({
    format,
    count: 600 - index * 50,
    mean_score: 75,
    minutes_watched: 90_000,
    media_ids: Array.from({ length: 40 }, (_, key) => key + index * 40),
  })),
  release_years: Array.from({ length: 30 }, (_, index) => ({
    year: 1995 + index,
    count: 100,
    mean_score: 75,
    minutes_watched: 30_000,
    media_ids: [index + 1],
  })),
  start_years: Array.from({ length: 15 }, (_, index) => ({
    year: 2010 + index,
    count: 200,
    mean_score: 75,
    minutes_watched: 60_000,
    media_ids: [index + 1],
  })),
  genres: GENRES.map((genre, index) => ({
    genre,
    count: 900 - index * 40,
    mean_score: 75,
    minutes_watched: 90_000,
    media_ids: Array.from({ length: 30 }, (_, key) => key + index * 30),
  })),
  studios: Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    name: `Studio ${index + 1}`,
    count: 400 - index * 10,
    mean_score: 75,
    minutes_watched: 40_000,
    media_ids: [index + 1],
  })),
};

const MEDIA_IDS = Array.from({ length: 500 }, (_, index) => index * 3 + 1);

function onePassGenreCompletion(lists: AniListCollection[]): number {
  const counts = new Map<string, { started: number; completed: number }>();
  for (const item of collectAllEntries(lists)) {
    if (item.list_status === "PLANNING") continue;
    for (const genre of item.media.genres) {
      const row = counts.get(genre) ?? { started: 0, completed: 0 };
      row.started += 1;
      if (item.list_status === "COMPLETED") row.completed += 1;
      counts.set(genre, row);
    }
  }
  let total = 0;
  for (const row of counts.values()) {
    if (row.started >= 5) total += row.completed / row.started;
  }
  return total;
}

function naiveGenreCompletion(lists: AniListCollection[]): number {
  const entries = collectAllEntries(lists).filter((item) => item.list_status !== "PLANNING");
  const genres = new Set(entries.flatMap((item) => item.media.genres));
  let total = 0;
  for (const genre of genres) {
    const inGenre = entries.filter((item) => item.media.genres.includes(genre));
    if (inGenre.length < 5) continue;
    total += inGenre.filter((item) => item.list_status === "COMPLETED").length / inGenre.length;
  }
  return total;
}

group("anilist stats @anilist @quick", () => {
  bench("overview, 3000 entries x200", () => {
    let sum = 0;
    for (let index = 0; index < 200; index++) {
      const model = buildStatsOverview({
        statistics: STATISTICS,
        lists: LISTS,
        scoreFormat: "POINT_10",
      });
      sum += model.genres.length + model.completion.length;
    }
    return sum;
  });

  bench("genre completion, one pass x200", () => {
    let sum = 0;
    for (let index = 0; index < 200; index++) sum += onePassGenreCompletion(LISTS);
    return sum;
  });

  bench("genre completion, naive x20", () => {
    let sum = 0;
    for (let index = 0; index < 20; index++) sum += naiveGenreCompletion(LISTS);
    return sum;
  });

  bench("drill-down rows, 500 ids x300", () => {
    let sum = 0;
    for (let index = 0; index < 300; index++) sum += buildMediaRows(MEDIA_IDS, LISTS).length;
    return sum;
  });
});
