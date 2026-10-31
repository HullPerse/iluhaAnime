import type { AniStreamingEpisode } from "@/types/anilist/anilist";

const NUMBER_PATTERNS = [
  /^\s*(?:episode|ep\.?|серия|эпизод)\s*(\d{1,4})\b/i,
  /^\s*(\d{1,4})\s*(?:[-\u2013\u2014:.]|\s|$)/,
];

export function episodeNumberFromTitle(title: string): number | null {
  for (const pattern of NUMBER_PATTERNS) {
    const match = pattern.exec(title);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isInteger(value) && value > 0) return value;
    }
  }
  return null;
}

export function anilistEpisodePreviews(
  episodes: readonly AniStreamingEpisode[]
): Map<number, string> {
  const previews = new Map<number, string>();
  for (const episode of episodes) {
    const number = episodeNumberFromTitle(episode.title);
    if (number === null || !episode.thumbnail) continue;
    if (!previews.has(number)) previews.set(number, episode.thumbnail);
  }
  return previews;
}
