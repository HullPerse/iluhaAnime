
import type { StreamHistoryEntry } from "@/types/player/stream";

export const STREAM_WATCHED_RATIO = 0.9;

export function isEpisodeWatched(
  entry: Pick<StreamHistoryEntry, "position" | "duration"> | null | undefined
): boolean {
  if (!entry || !(entry.duration > 0) || !(entry.position > 0)) return false;
  return entry.position / entry.duration >= STREAM_WATCHED_RATIO;
}

export function episodeResume(entry: StreamHistoryEntry | null | undefined): number | undefined {
  if (!entry || isEpisodeWatched(entry)) return undefined;
  return entry.position > 0 ? entry.position : undefined;
}

export function formatResume(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function watchShare(
  entry: Pick<StreamHistoryEntry, "position" | "duration"> | null | undefined
): number {
  if (!entry || !(entry.duration > 0)) return 0;
  return Math.min(1, Math.max(0, entry.position / entry.duration));
}

export function historyByEpisode(
  entries: readonly StreamHistoryEntry[]
): ReadonlyMap<string, StreamHistoryEntry> {
  const map = new Map<string, StreamHistoryEntry>();
  for (const entry of entries) map.set(entry.episodeId, entry);
  return map;
}
