import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { useAnilistSearch } from "@/hooks/anilist/search.hook";
import type { AniMedia } from "@/types/anilist/anilist";
import type { FilterPage } from "@/types/core/ipc";

const media = (id: number): AniMedia =>
  ({
    id,
    title: `Show ${id}`,
    next_airing_at: null,
    next_episode: null,
    cover_url: null,
  }) as AniMedia;

const page = (ids: number[], total: number): FilterPage => ({
  media: ids.map(media),
  total,
});

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("useAnilistSearch pagination", () => {
  it("loads tag results one page at a time", async () => {
    const filterPage = vi
      .spyOn(anilistApi, "filterPage")
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, index) => index + 1),
          45
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, index) => index + 21),
          45
        )
      );

    const { result } = renderHook(() => useAnilistSearch(), { wrapper });

    act(() => result.current.handleTag("Action"));

    await waitFor(() => expect(result.current.searchResults).toHaveLength(20));
    expect(filterPage).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["Action"], page: 1, perPage: 20 })
    );
    expect(result.current.hasNextSearchPage).toBe(true);

    act(() => result.current.fetchNextSearchPage());

    await waitFor(() => expect(result.current.searchResults).toHaveLength(40));
    expect(filterPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ tags: ["Action"], page: 2 })
    );
  });

  it("uses the paged filter endpoint for season searches", async () => {
    const filterPage = vi.spyOn(anilistApi, "filterPage").mockResolvedValue(page([31], 1));

    const { result } = renderHook(() => useAnilistSearch(), { wrapper });

    act(() => result.current.handleSeason("WINTER", 2026));

    await waitFor(() => expect(result.current.searchResults).toHaveLength(1));
    expect(filterPage).toHaveBeenCalledWith(
      expect.objectContaining({ season: "WINTER", seasonYear: 2026, page: 1, perPage: 40 })
    );
    expect(filterPage.mock.calls[0]?.[0]).not.toHaveProperty("maxPages");
  });
});
