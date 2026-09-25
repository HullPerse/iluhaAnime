import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultFilters } from "@/config/anilist/filters.config";
import { useDiscoveryQueue, useRandomDiscovery } from "@/hooks/anilist/discovery.hook";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListFilters, AniMedia } from "@/types/anilist";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function makeMedia(id: number, title: string): AniMedia {
  return {
    id,
    title,
    titles: [title],
    episodes: 12,
    duration: 24,
    format: "TV",
    status: "FINISHED",
    score: 80,
    genres: ["Action"],
    tags: [],
    description: "desc",
    cover_url: null,
    studios: [],
    next_episode: null,
    next_airing_at: null,
    start_date: null,
    end_date: null,
    popularity: null,
    favourites: null,
    rankings: [],
    relations: [],
    season: null,
    season_year: 2020,
  };
}

const FILTERS: AniListFilters = { ...defaultFilters };

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ anilistProxyUrl: null });
});

describe("useDiscoveryQueue", () => {
  it("starts empty without a current item", () => {
    const { result } = renderHook(() => useDiscoveryQueue<number>());
    expect(result.current.current).toBeUndefined();
    expect(result.current.total).toBe(0);
    expect(result.current.index).toBe(0);
    expect(result.current.canPrev).toBe(false);
  });

  it("push sets the current item and grows the total", () => {
    const { result } = renderHook(() => useDiscoveryQueue<number>());
    act(() => {
      result.current.push(7);
    });
    expect(result.current.current).toBe(7);
    expect(result.current.total).toBe(1);
    expect(result.current.index).toBe(0);
    act(() => {
      result.current.push(9);
    });
    expect(result.current.current).toBe(9);
    expect(result.current.total).toBe(2);
    expect(result.current.index).toBe(1);
    expect(result.current.canPrev).toBe(true);
  });

  it("prev walks back without dropping history and stays at zero", () => {
    const { result } = renderHook(() => useDiscoveryQueue<number>());
    act(() => {
      result.current.push(7);
    });
    act(() => {
      result.current.push(9);
    });
    act(() => {
      result.current.prev();
    });
    expect(result.current.current).toBe(7);
    expect(result.current.index).toBe(0);
    expect(result.current.total).toBe(2);
    expect(result.current.canPrev).toBe(false);
    act(() => {
      result.current.prev();
    });
    expect(result.current.current).toBe(7);
    expect(result.current.index).toBe(0);
  });

  it("push after prev truncates the forward branch", () => {
    const { result } = renderHook(() => useDiscoveryQueue<number>());
    act(() => {
      result.current.push(7);
    });
    act(() => {
      result.current.push(9);
    });
    act(() => {
      result.current.prev();
    });
    act(() => {
      result.current.push(11);
    });
    expect(result.current.history).toEqual([7, 11]);
    expect(result.current.current).toBe(11);
    expect(result.current.total).toBe(2);
  });

  it("reset clears history and index", () => {
    const { result } = renderHook(() => useDiscoveryQueue<number>());
    act(() => {
      result.current.push(7);
    });
    act(() => {
      result.current.push(9);
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.current).toBeUndefined();
    expect(result.current.total).toBe(0);
    expect(result.current.index).toBe(0);
    expect(result.current.canPrev).toBe(false);
  });
});

describe("useRandomDiscovery", () => {
  it("opens with the picked anime on start", async () => {
    invokeMock.mockResolvedValue({ media: [makeMedia(1, "One")], total: 1 });
    const { result } = renderHook(() => useRandomDiscovery());
    act(() => {
      result.current.start(FILTERS);
    });
    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.current?.id).toBe(1);
    expect(result.current.total).toBe(1);
    expect(result.current.pending).toBe(false);
  });

  it("stays closed when filters match nothing", async () => {
    invokeMock.mockResolvedValue({ media: [], total: 0 });
    const { result } = renderHook(() => useRandomDiscovery());
    act(() => {
      result.current.start(FILTERS);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.open).toBe(false);
    expect(result.current.current).toBeUndefined();
  });

  it("stays closed when the request fails", async () => {
    invokeMock.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useRandomDiscovery());
    act(() => {
      result.current.start(FILTERS);
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.open).toBe(false);
  });

  it("reroll appends, prev walks back, close resets", async () => {
    invokeMock
      .mockResolvedValueOnce({ media: [makeMedia(1, "One")], total: 1 })
      .mockResolvedValueOnce({ media: [makeMedia(2, "Two")], total: 1 });
    const { result } = renderHook(() => useRandomDiscovery());
    act(() => {
      result.current.start(FILTERS);
    });
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => {
      result.current.reroll();
    });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.current?.id).toBe(2);
    act(() => {
      result.current.prev();
    });
    expect(result.current.current?.id).toBe(1);
    expect(result.current.canPrev).toBe(false);
    act(() => {
      result.current.close();
    });
    expect(result.current.open).toBe(false);
    expect(result.current.total).toBe(0);
    expect(result.current.current).toBeUndefined();
  });

  it("reroll skips already seen anime", async () => {
    invokeMock
      .mockResolvedValueOnce({ media: [makeMedia(1, "One")], total: 1 })
      .mockResolvedValueOnce({ media: [makeMedia(1, "One"), makeMedia(2, "Two")], total: 2 });
    const { result } = renderHook(() => useRandomDiscovery());
    act(() => {
      result.current.start(FILTERS);
    });
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => {
      result.current.reroll();
    });
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.current?.id).toBe(2);
  });
});
