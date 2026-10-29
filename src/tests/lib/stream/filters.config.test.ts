import { describe, expect, it } from "vitest";

import {
  DEFAULT_STREAM_FILTERS,
  STREAM_YEAR_MIN,
  countActiveStreamFilters,
  isAdultAgeRating,
  streamFiltersKey,
  streamYearMax,
  withoutAdultFilters,
} from "@/config/stream/filters.config";
import type { StreamGenreOption } from "@/types/stream";

const GENRES: StreamGenreOption[] = [
  { id: 1, label: "Action", adult: false },
  { id: 2, label: "Hentai", adult: true },
];

describe("stream catalog filters", () => {
  it("counts only the groups the user changed", () => {
    expect(countActiveStreamFilters(DEFAULT_STREAM_FILTERS)).toBe(0);
    expect(
      countActiveStreamFilters({
        ...DEFAULT_STREAM_FILTERS,
        types: [16],
        statuses: [2, 3],
        yearMin: 2020,
        episodesMax: 24,
        sortBy: "views",
        sortType: "asc",
      })
    ).toBe(6);
  });

  it("keys the same selection the same way regardless of pick order", () => {
    const first = streamFiltersKey({ ...DEFAULT_STREAM_FILTERS, genres: [3, 1, 2] });
    const second = streamFiltersKey({ ...DEFAULT_STREAM_FILTERS, genres: [1, 2, 3] });
    expect(first).toBe(second);
  });

  it("drops the 18+ rating and adult genres when NSFW is turned off", () => {
    const next = withoutAdultFilters(
      {
        ...DEFAULT_STREAM_FILTERS,
        adult: true,
        ageRatings: [3, 5],
        genres: [1, 2],
      },
      GENRES
    );

    expect(next.adult).toBe(false);
    expect(next.ageRatings).toEqual([3]);
    expect(next.genres).toEqual([1]);
  });

  it("keeps the year slider inside the catalog range", () => {
    expect(STREAM_YEAR_MIN).toBe(1960);
    expect(streamYearMax()).toBeGreaterThanOrEqual(new Date().getFullYear());
    expect(isAdultAgeRating(5)).toBe(true);
    expect(isAdultAgeRating(4)).toBe(false);
  });
});
