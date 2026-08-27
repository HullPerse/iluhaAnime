export interface PersonalAnimeStats {
  totalAnime: number;
  completed: number;
  watching: number;
  planned: number;
  dropped: number;
  paused: number;
  episodesWatched: number;
  scored: number;
  meanScore: number | null;
  totalMinutes: number;
  topGenres: { name: string; count: number }[];
  topTitles: { title: string; score: number }[];
}
