import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { useEnsureAnimeIndex } from "@/hooks/search/animeIndex.hook";
import { suggestSpelling } from "@/lib/search/suggestions.utils";
import { searchAtoms } from "@/store/search.store";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const listsFixture = [
  {
    entries: [
      {
        list_status: "CURRENT",
        media: {
          id: 21,
          season: null,
          season_year: 2023,
          title: "Frieren: Beyond Journey's End",
          titles: ["Frieren: Beyond Journey's End", "Sousou no Frieren"],
        },
        score: 0,
      },
    ],
    name: "Watching",
  },
] as never;

function upsertedIds(): string[] {
  return invokeMock.mock.calls
    .filter(([command]) => command === "upsert_unified_index")
    .flatMap(([, args]) => (args as { entries: Array<{ id: string }> }).entries.map((e) => e.id));
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  searchAtoms.animeIndex.set([]);
  searchAtoms.animeProfileId.set(null);
  vi.spyOn(anilistApi, "checkAuth").mockResolvedValue({ id: 7 } as never);
  vi.spyOn(anilistApi, "getLists").mockResolvedValue(listsFixture);
  vi.spyOn(anilistApi, "getFavouriteOverview").mockResolvedValue({
    anime: [],
    people: { characters: [], staff: [] },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useEnsureAnimeIndex", () => {
  it("indexes user lists on mount without the anilist route", async () => {
    renderHook(() => useEnsureAnimeIndex(), { wrapper });
    await waitFor(() => expect(searchAtoms.animeIndex.get()).toHaveLength(1));
    expect(searchAtoms.animeIndex.get()[0]?.title).toBe("Frieren: Beyond Journey's End");
    expect(searchAtoms.animeProfileId.get()).toBe(7);
    await waitFor(() => expect(upsertedIds()).toContain("anime:21"));
  });

  it("resolves typos from the fresh index", async () => {
    renderHook(() => useEnsureAnimeIndex(), { wrapper });
    await waitFor(() => expect(searchAtoms.animeIndex.get()).toHaveLength(1));
    expect(suggestSpelling("friren", { animeIndex: searchAtoms.animeIndex.get() })).toBe("frieren");
  });

  it("stays empty when logged out", async () => {
    vi.spyOn(anilistApi, "checkAuth").mockResolvedValue(null);
    renderHook(() => useEnsureAnimeIndex(), { wrapper });
    await waitFor(() => expect(anilistApi.checkAuth).toHaveBeenCalled());
    await waitFor(() => expect(anilistApi.getLists).not.toHaveBeenCalled());
    expect(searchAtoms.animeIndex.get()).toEqual([]);
  });
});
