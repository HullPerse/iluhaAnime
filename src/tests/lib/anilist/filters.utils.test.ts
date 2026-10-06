import { describe, expect, it } from "vitest";

import { defaultFilters } from "@/config/anilist/filters.config";
import { defaultAniListFilters } from "@/lib/anilist/filters.utils";

describe("defaultAniListFilters", () => {
  it("applies the requested adult flag on top of the config defaults", () => {
    expect(defaultAniListFilters(true).adult).toBe(true);
    expect(defaultAniListFilters(false).adult).toBe(false);
  });

  it("leaves the other defaults untouched", () => {
    expect(defaultAniListFilters(true)).toEqual({ ...defaultFilters, adult: true });
  });

  it("returns a fresh object so callers cannot mutate the config default", () => {
    const first = defaultAniListFilters(false);
    first.adult = true;

    expect(defaultFilters.adult).toBe(false);
    expect(defaultAniListFilters(false).adult).toBe(false);
  });
});
