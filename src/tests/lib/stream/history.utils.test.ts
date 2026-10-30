import { describe, expect, it } from "vitest";

import {
  STREAM_WATCHED_RATIO,
  episodeResume,
  formatResume,
  historyByEpisode,
  isEpisodeWatched,
  watchShare,
} from "@/lib/stream/history.utils";
import type { StreamHistoryEntry } from "@/types/stream";

function entry(overrides: Partial<StreamHistoryEntry> = {}): StreamHistoryEntry {
  return {
    animeId: "21371",
    episodeId: "9001",
    slug: "21371--sousou-no-frieren-anime",
    title: "Sousou no Frieren",
    episodeNumber: 3,
    position: 600,
    duration: 1440,
    updatedAt: 100,
    ...overrides,
  };
}

describe("stream history rules", () => {
  it("calls an episode watched at ninety percent and not before", () => {
    expect(STREAM_WATCHED_RATIO).toBe(0.9);
    expect(isEpisodeWatched(entry({ position: 1295 }))).toBe(false);
    expect(isEpisodeWatched(entry({ position: 1296 }))).toBe(true);
    expect(isEpisodeWatched(entry({ position: 1440 }))).toBe(true);
  });

  it("never calls a row without a duration watched", () => {
    expect(isEpisodeWatched(entry({ position: 1400, duration: 0 }))).toBe(false);
    expect(isEpisodeWatched(null)).toBe(false);
  });

  it("resumes an unfinished episode and restarts a watched one", () => {
    expect(episodeResume(entry({ position: 600 }))).toBe(600);
    expect(episodeResume(entry({ position: 1296 }))).toBeUndefined();
    expect(episodeResume(entry({ position: 0 }))).toBeUndefined();
    expect(episodeResume(undefined)).toBeUndefined();
  });

  it("formats a resume label for minutes and hours", () => {
    expect(formatResume(0)).toBe("00:00");
    expect(formatResume(754)).toBe("12:34");
    expect(formatResume(3723)).toBe("1:02:03");
  });

  it("clamps the progress share", () => {
    expect(watchShare(entry({ position: 720 }))).toBe(0.5);
    expect(watchShare(entry({ position: 2000 }))).toBe(1);
    expect(watchShare(entry({ duration: 0 }))).toBe(0);
  });

  it("keys the rows by episode id", () => {
    const map = historyByEpisode([entry({ episodeId: "1" }), entry({ episodeId: "2" })]);
    expect(map.get("2")?.episodeId).toBe("2");
    expect(map.size).toBe(2);
  });
});
