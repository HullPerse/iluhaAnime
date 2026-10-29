// AniList episode previews for a stream season.
//
// AnimeLib's episode rows carry no image of their own in most seasons, so the
// only per-episode art available is the thumbnail AniList keeps for the
// title's streaming services. Those rows are not numbered by AniList, only
// titled, so the number is read back from the title and duplicates (several
// services often list the same episode) keep the first preview.

import type { AniStreamingEpisode } from "@/types/anilist";

const NUMBER_PATTERNS = [
  /^\s*(?:episode|ep\.?|серия|эпизод)\s*(\d{1,4})\b/i,
  /^\s*(\d{1,4})\s*(?:[-\u2013\u2014:.]|\s|$)/,
];

/** The episode number an AniList streaming title starts with, if any. */
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

/**
 * Previews keyed by episode number. A row without a thumbnail or without a
 * readable number is skipped rather than guessed at.
 */
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
