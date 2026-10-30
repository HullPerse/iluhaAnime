// Stream watch-history rules.
//
// The player writes rows; the UI only interprets them. Keeping the threshold
// and the label formatting here means the episode list, the history modal and
// the hover badge cannot disagree about what "watched" means.

import type { StreamHistoryEntry } from "@/types/player/stream";

/** A row is watched when it reached this share of its known duration. */
export const STREAM_WATCHED_RATIO = 0.9;

/** Rows without a duration are never watched: a live URL has no end. */
export function isEpisodeWatched(
  entry: Pick<StreamHistoryEntry, "position" | "duration"> | null | undefined
): boolean {
  if (!entry || !(entry.duration > 0) || !(entry.position > 0)) return false;
  return entry.position / entry.duration >= STREAM_WATCHED_RATIO;
}

/**
 * Where a click should start. A watched episode plays from the beginning
 * (that is what "watched" means here); an in-progress one resumes; an unknown
 * one starts at zero.
 */
export function episodeResume(entry: StreamHistoryEntry | null | undefined): number | undefined {
  if (!entry || isEpisodeWatched(entry)) return undefined;
  return entry.position > 0 ? entry.position : undefined;
}

/** `12:34`, or `1:02:03` past an hour. */
export function formatResume(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The share watched, 0..1, for a progress bar. */
export function watchShare(
  entry: Pick<StreamHistoryEntry, "position" | "duration"> | null | undefined
): number {
  if (!entry || !(entry.duration > 0)) return 0;
  return Math.min(1, Math.max(0, entry.position / entry.duration));
}

/** Episode rows keyed by id, which is how the list looks them up. */
export function historyByEpisode(
  entries: readonly StreamHistoryEntry[]
): ReadonlyMap<string, StreamHistoryEntry> {
  const map = new Map<string, StreamHistoryEntry>();
  for (const entry of entries) map.set(entry.episodeId, entry);
  return map;
}
