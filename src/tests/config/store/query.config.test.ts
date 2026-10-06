import { describe, expect, it } from "vitest";

import { QUERY_PRESETS } from "@/config/store/query.config";

describe("QUERY_PRESETS", () => {
  it("keeps cached data alive past its freshness window", () => {
    for (const [name, preset] of Object.entries(QUERY_PRESETS)) {
      expect(
        preset.gcTime > preset.staleTime || preset.staleTime === Number.POSITIVE_INFINITY,
        `${name} evicts cache before it goes stale`
      ).toBe(true);
    }
  });

  it("shares one slow freshness window with browse prefetching", () => {
    expect(QUERY_PRESETS.slow.staleTime).toBe(5 * 60 * 1000);
  });
});
