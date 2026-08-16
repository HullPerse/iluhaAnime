import { describe, expect, it } from "vitest";

import { derivePersonalAnimeStats } from "@/lib/anime.stats";
import type { AniListCollection } from "@/types/anilist";

describe("personal anime stats", () => {
  it("aggregates list statuses, watch time, genres, and scores without another API request", () => {
    const stats = derivePersonalAnimeStats([
      {
        entries: [
          {
            media: { id: 1, title: "One", genres: ["Action"], duration: 24 },
            progress: 3,
            score: 8,
            list_status: "CURRENT",
            created_at: null,
            completed_at: null,
            updated_at: null,
          },
        ],
        name: "Watching",
      },
      {
        entries: [
          {
            media: {
              id: 2,
              title: "Two",
              genres: ["Action", "Drama"],
              duration: 20,
            },
            progress: 12,
            score: 10,
            list_status: "COMPLETED",
            created_at: null,
            completed_at: null,
            updated_at: null,
          },
        ],
        name: "Completed",
      },
    ] as unknown as AniListCollection[]);
    expect(stats.totalAnime).toBe(2);
    expect(stats.watching).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.episodesWatched).toBe(15);
    expect(stats.totalMinutes).toBe(312);
    expect(stats.meanScore).toBe(9);
    expect(stats.topGenres[0]).toEqual({ count: 2, name: "Action" });
  });
});
