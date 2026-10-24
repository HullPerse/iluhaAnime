import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { useAnilistStatistics } from "@/hooks/anilist/stats.hook";
import type { AniListStatistics } from "@/types/anilist";

const EMPTY_STATISTICS: AniListStatistics = {
  count: 0,
  mean_score: 0,
  standard_deviation: 0,
  minutes_watched: 0,
  episodes_watched: 0,
  statuses: [],
  scores: [],
  formats: [],
  release_years: [],
  start_years: [],
  genres: [],
  studios: [],
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("useAnilistStatistics", () => {
  it("does not fetch without a user and keeps the data null", () => {
    const fetch = vi.spyOn(anilistApi, "getStatistics").mockResolvedValue(EMPTY_STATISTICS);
    const { result } = renderHook(() => useAnilistStatistics(null), { wrapper });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.statistics).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("loads the statistics for the given user", async () => {
    vi.spyOn(anilistApi, "getStatistics").mockResolvedValue({ ...EMPTY_STATISTICS, count: 42 });
    const { result } = renderHook(() => useAnilistStatistics(7), { wrapper });

    await waitFor(() => expect(result.current.statistics?.count).toBe(42));
    expect(anilistApi.getStatistics).toHaveBeenCalledWith(7);
    expect(result.current.error).toBeNull();
    expect(result.current.updatedAt).toBeGreaterThan(0);
  });

  it("reports the failure message and refetches on retry", async () => {
    const fetch = vi
      .spyOn(anilistApi, "getStatistics")
      .mockRejectedValue(new Error("Not authenticated"));
    const { result } = renderHook(() => useAnilistStatistics(7), { wrapper });

    await waitFor(() => expect(result.current.error).toBe("Not authenticated"));
    expect(fetch).toHaveBeenCalled();

    fetch.mockResolvedValue({ ...EMPTY_STATISTICS, count: 3 });
    result.current.retry();

    await waitFor(() => expect(result.current.statistics?.count).toBe(3));
    expect(result.current.error).toBeNull();
  });
});
