import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useAnimeShowcase } from "@/hooks/showcase.hook";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

function makeMedia(overrides: Partial<AniMedia>): AniMedia {
  return {
    id: 1,
    title: "Test",
    titles: [],
    episodes: null,
    duration: null,
    format: null,
    status: "FINISHED",
    score: null,
    genres: [],
    tags: [],
    description: null,
    cover_url: null,
    season: null,
    season_year: null,
    studios: [],
    next_episode: null,
    next_airing_at: null,
    start_date: null,
    end_date: null,
    popularity: null,
    favourites: null,
    rankings: [],
    relations: [],
    ...overrides,
  };
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue([]);
  useSettingsStore.setState({ tmdbApiKey: "key", tmdbProxyUrl: null });
});

describe("useAnimeShowcase", () => {
  it("uses the AniList trailer id directly", async () => {
    const { result } = renderHook(
      () => useAnimeShowcase(makeMedia({ trailer_youtube_id: "direct1" })),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current?.trailerYoutubeId).toBe("direct1");
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("looks the trailer up on TMDB when AniList has none", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "search_tmdb") return Promise.resolve([{ id: 5, media_type: "tv" }]);
      if (cmd === "get_tmdb_media")
        return Promise.resolve({ backdrops: [{ url: "https://img/b.jpg" }], trailerYoutubeId: "tmdb1" });
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useAnimeShowcase(makeMedia({})), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current?.trailerYoutubeId).toBe("tmdb1");
    });
  });

  it("yields no trailer without AniList id, TMDB key, or matches", async () => {
    useSettingsStore.setState({ tmdbApiKey: null });
    const { result } = renderHook(() => useAnimeShowcase(makeMedia({})), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current?.trailerYoutubeId).toBeNull();
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
