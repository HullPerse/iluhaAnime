import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { useAnimeInlineSearch } from "@/hooks/anilist/inline-search.hook";
import type { AniMedia } from "@/types/anilist";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function media(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    banner_image: null,
    cover_url: null,
    description: null,
    duration: null,
    end_date: null,
    episodes: 24,
    favourites: null,
    format: "TV",
    genres: [],
    id: 21,
    id_mal: null,
    next_airing_at: null,
    next_episode: null,
    popularity: null,
    rankings: [],
    relations: [],
    score: 87,
    season: null,
    season_year: 1999,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "One Piece",
    title_english: null,
    title_native: null,
    title_romaji: null,
    titles: [],
    trailer_youtube_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAnimeInlineSearch", () => {
  it("returns no options below the minimum query length", () => {
    const search = vi.spyOn(anilistApi, "search").mockResolvedValue([]);
    const { result } = renderHook(() => useAnimeInlineSearch("f"), { wrapper });

    expect(result.current.options).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });

  it("stays quiet while disabled", () => {
    const search = vi.spyOn(anilistApi, "search").mockResolvedValue([media()]);
    const { result } = renderHook(() => useAnimeInlineSearch("one piece", false), {
      wrapper,
    });

    expect(result.current.options).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it("searches the debounced query", async () => {
    const search = vi.spyOn(anilistApi, "search").mockResolvedValue([media()]);
    const { result } = renderHook(() => useAnimeInlineSearch("one piece"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.options).toHaveLength(1));

    expect(result.current.options.map((option) => option.title)).toEqual([
      "One Piece",
    ]);
    expect(result.current.error).toBe(false);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "one piece", perPage: 8, maxPages: 1 })
    );
  });

  it("reports a backend failure as an error flag", async () => {
    vi.spyOn(anilistApi, "search").mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useAnimeInlineSearch("one piece"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.error).toBe(true));

    expect(result.current.options).toEqual([]);
  });
});
