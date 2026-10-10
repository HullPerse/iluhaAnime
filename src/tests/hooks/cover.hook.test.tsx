import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTorrentCover } from "@/hooks/search/cover.hook";
import {
  coverKey,
  removeCoverOverride,
  removeResolvedCover,
  setResolvedCover,
} from "@/store/cover.store";
import { searchAtoms } from "@/store/search.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function media(partial: Partial<AniMedia>): AniMedia {
  return {
    id: 0,
    title: "",
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
    ...partial,
  };
}

const NARUTO = media({
  id: 20,
  title: "NARUTO",
  titles: ["NARUTO"],
  title_romaji: "NARUTO",
  format: "TV",
  season_year: 2002,
  cover_url: "https://s4.anilist.co/file/naruto.jpg",
});

function renderCover(
  title: string,
  options?: { source?: string; url?: string | null; enabled?: boolean }
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTorrentCover(title, options), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

afterEach(() => {
  removeCoverOverride("naruto|0");
  removeCoverOverride("tochno ne ampir|0");
  removeResolvedCover("naruto|0");
  removeResolvedCover("tochno ne ampir|0");
  removeResolvedCover("one piece|0");
  removeResolvedCover("sousou no frieren|2");
  removeResolvedCover("sousou no frieren|0");
  removeResolvedCover(coverKey("Атака титанов"));
});

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("useTorrentCover", () => {
  it("resolves the cover through the search cascade", async () => {
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "search_anilist") return [NARUTO];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const { result } = renderCover("[SubsPlease] Naruto - 01 (1080p).mkv");
    await waitFor(() => expect(result.current.status).toBe("resolved"));
    expect(result.current.anilistId).toBe(20);
    expect(result.current.coverUrl).toContain("http://asset.localhost/");
    expect(result.current.candidates.map((c) => c.id)).toContain(20);
  });

  it("reports empty when nothing matches", async () => {
    mockInvoke.mockImplementation(async () => []);
    const { result } = renderCover("Tochno Ne Ampir V.mkv");
    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.coverUrl).toBeNull();
    expect(result.current.anilistId).toBeNull();
  });

  it("rewrites the query from the local anime index", async () => {
    searchAtoms.animeIndex.set([
      {
        id: 16498,
        title: "Shingeki no Kyojin",
        aliases: ["Attack on Titan", "Атака титанов"],
        status: "COMPLETED",
        score: 7,
        favourite: false,
      },
    ]);
    const queries: unknown[] = [];
    mockInvoke.mockImplementation(async (command: unknown, args: unknown) => {
      if (command === "search_anilist") {
        queries.push((args as { query?: unknown }).query);
        const q = String((args as { query?: unknown }).query ?? "");
        if (q === "Shingeki no Kyojin") {
          return [
            media({
              id: 16498,
              title: "Shingeki no Kyojin",
              titles: ["Shingeki no Kyojin"],
              title_romaji: "Shingeki no Kyojin",
              format: "TV",
              cover_url: "https://s4.anilist.co/file/shingeki.jpg",
            }),
          ];
        }
        return [];
      }
      if (command === "download_remote_image") return { id: "blob2", path: "covers/snk.jpg" };
      return null;
    });
    try {
      const { result } = renderCover("Атака титанов - 01 [WEB-DL 1080p].mkv");
      await waitFor(() => expect(result.current.status).toBe("resolved"));
      expect(result.current.anilistId).toBe(16498);
      expect(queries[0]).toBe("Shingeki no Kyojin");
    } finally {
      searchAtoms.animeIndex.set([]);
    }
  });

  it("prefers the torrent page poster for rutracker", async () => {
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "get_torrent_details") {
        return { poster: "https://img.rutracker.org/f/009/poster.jpg" };
      }
      if (command === "download_remote_image") return { id: "blob3", path: "covers/rt.jpg" };
      return null;
    });
    const { result } = renderCover("[Nekomoe] One Piece - 01 [1080p].mkv", {
      source: "rutracker",
      url: "https://rutracker.org/forum/viewtopic.php?t=9",
    });
    await waitFor(() => expect(result.current.status).toBe("page"));
    expect(result.current.anilistId).toBeNull();
    expect(result.current.coverUrl).toContain("http://asset.localhost/");
  });

  it("fires no queries when disabled", async () => {
    const calls: unknown[] = [];
    mockInvoke.mockImplementation(async (command: unknown) => {
      calls.push(command);
      return null;
    });
    const { result } = renderCover("[SubsPlease] Naruto - 01 (1080p).mkv", {
      source: "rutracker",
      url: "https://rutracker.org/forum/viewtopic.php?t=9",
      enabled: false,
    });
    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(calls).toEqual([]);
  });

  it("falls back to anilist when the page has no poster", async () => {
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "get_torrent_details") return { poster: null };
      if (command === "search_anilist") return [NARUTO];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const { result } = renderCover("[SubsPlease] Naruto - 01 (1080p).mkv", {
      source: "rutracker",
      url: "https://rutracker.org/forum/viewtopic.php?t=9",
    });
    await waitFor(() => expect(result.current.status).toBe("resolved"));
    expect(result.current.anilistId).toBe(20);
  });

  it("falls back to anilist when the page request fails", async () => {
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "get_torrent_details") throw new Error("boom");
      if (command === "search_anilist") return [NARUTO];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const { result } = renderCover("[SubsPlease] Naruto - 01 (1080p).mkv", {
      source: "rutracker",
      url: "https://rutracker.org/forum/viewtopic.php?t=9",
    });
    await waitFor(() => expect(result.current.status).toBe("resolved"));
    expect(result.current.anilistId).toBe(20);
  });

  it("skips the page lookup for foreign urls and still resolves", async () => {
    const calls: unknown[] = [];
    mockInvoke.mockImplementation(async (command: unknown) => {
      calls.push(command);
      if (command === "search_anilist") return [NARUTO];
      if (command === "download_remote_image") return { id: "blob1", path: "covers/naruto.jpg" };
      return null;
    });
    const { result } = renderCover("[SubsPlease] Naruto - 01 (1080p).mkv", {
      source: "rutracker",
      url: "https://example.com/viewtopic.php?t=9",
    });
    await waitFor(() => expect(result.current.status).toBe("resolved"));
    expect(result.current.anilistId).toBe(20);
    expect(calls).not.toContain("get_torrent_details");
  });

  it("serves a cached resolution without searching", async () => {
    setResolvedCover("naruto|0", {
      id: 20,
      coverUrl: "https://s4.anilist.co/file/naruto.jpg",
      title: "NARUTO",
      at: 1,
    });
    const calls: unknown[] = [];
    mockInvoke.mockImplementation(async (command: unknown) => {
      calls.push(command);
      return null;
    });
    const { result } = renderCover("[SubsPlease] Naruto - 01 (1080p).mkv");
    await waitFor(() => expect(result.current.status).toBe("resolved"));
    expect(result.current.anilistId).toBe(20);
    expect(calls).not.toContain("search_anilist");
  });

  it("resolves a second season to its own entry, not the trusted first", async () => {
    searchAtoms.animeIndex.set([
      {
        id: 11,
        title: "Sousou no Frieren",
        aliases: [],
        status: "COMPLETED",
        score: 9,
        favourite: true,
      },
    ]);
    const queries: unknown[] = [];
    mockInvoke.mockImplementation(async (command: unknown, args: unknown) => {
      if (command === "search_anilist") {
        queries.push((args as { query?: unknown }).query);
        return [
          media({
            id: 11,
            title: "Sousou no Frieren",
            titles: ["Sousou no Frieren"],
            title_romaji: "Sousou no Frieren",
            format: "TV",
            cover_url: "https://s4.anilist.co/file/s1.jpg",
          }),
          media({
            id: 22,
            title: "Sousou no Frieren 2nd Season",
            titles: ["Sousou no Frieren 2nd Season"],
            title_romaji: "Sousou no Frieren 2nd Season",
            format: "TV",
            cover_url: "https://s4.anilist.co/file/s2.jpg",
          }),
        ];
      }
      if (command === "download_remote_image") return { id: "blob-s2", path: "covers/s2.jpg" };
      return null;
    });
    try {
      const { result } = renderCover("[Erai-raws] Sousou no Frieren 2nd Season - 09 [1080p].mkv");
      await waitFor(() => expect(result.current.status).toBe("resolved"));
      expect(result.current.anilistId).toBe(22);
    } finally {
      searchAtoms.animeIndex.set([]);
    }
  });

  it("shares a resolved cover with another spelling of the same title", async () => {
    setResolvedCover("sousou no frieren|0", {
      id: 154587,
      coverUrl: "https://s4.anilist.co/file/frieren.jpg",
      title: "Sousou no Frieren",
      at: 1,
      names: ["sousou no frieren", "frieren beyond journey s end"],
      season: 0,
    });
    const calls: unknown[] = [];
    mockInvoke.mockImplementation(async (command: unknown) => {
      calls.push(command);
      if (command === "download_remote_image") return { id: "blob-f", path: "covers/f.jpg" };
      return null;
    });
    const { result } = renderCover("[Group] Frieren - Beyond Journey's End - 01 [1080p].mkv");
    await waitFor(() => expect(result.current.status).toBe("resolved"));
    expect(result.current.anilistId).toBe(154587);
    expect(calls).not.toContain("search_anilist");
  });
});
