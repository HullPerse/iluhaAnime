import type { AniListCollection } from "@/types/anilist";
import type { PersonalAnimeStats } from "@/types/stats";

export function derivePersonalAnimeStats(
  lists: AniListCollection[]
): PersonalAnimeStats {
  const entries = lists.flatMap((list) => list.entries);
  const count = (status: string) =>
    entries.filter((entry) => entry.list_status === status).length;
  const scored = entries.filter(
    (entry) => entry.score != null && entry.score > 0
  );
  const genreCounts = new Map<string, number>();
  for (const entry of entries)
    for (const genre of entry.media.genres ?? [])
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ count: value, name }));
  const topTitles = entries
    .filter((entry) => entry.score != null && entry.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5)
    .map((entry) => ({ score: entry.score ?? 0, title: entry.media.title }));
  return {
    completed: count("COMPLETED"),
    dropped: count("DROPPED"),
    episodesWatched: entries.reduce(
      (total, entry) => total + (entry.progress ?? 0),
      0
    ),
    meanScore: scored.length
      ? scored.reduce((total, entry) => total + (entry.score ?? 0), 0) /
        scored.length
      : null,
    paused: count("PAUSED"),
    planned: count("PLANNING"),
    scored: scored.length,
    topGenres,
    topTitles,
    totalAnime: entries.length,
    totalMinutes: entries.reduce(
      (total, entry) =>
        total + (entry.progress ?? 0) * (entry.media.duration ?? 0),
      0
    ),
    watching: count("CURRENT") + count("REPEATING"),
  };
}
