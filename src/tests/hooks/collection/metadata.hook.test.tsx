import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCollectionMetadata } from "@/hooks/collection/metadata.hook";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: "item-1",
    type: "anime",
    status: "watching",
    progressValue: 0,
    progressTotal: null,
    progressUnit: "episodes",
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    title: "Frieren",
    altTitles: [],
    year: 2023,
    releaseDate: null,
    genres: [],
    studio: null,
    description: null,
    notes: null,
    coverUrl: "https://example.com/old.jpg",
    coverBlobId: "blob-1",
    thumbBlobId: "t336_blob-1",
    externalIds: { anilist: 21 },
    customFields: {},
    localPath: null,
    localKind: null,
    startedAt: null,
    finishedAt: null,
    lastWatchedAt: null,
    rewatchCount: 0,
    addedAt: 0,
    updatedAt: 0,
    sitesToView: [],
    tvCurrentSeason: null,
    tvCurrentEpisode: null,
    detailsJson: null,
    ...overrides,
  };
}

function animeMeta(coverUrl: string | null) {
  return {
    title: "Frieren",
    duration: null,
    episodes: null,
    tags: [],
    genres: [],
    studios: [],
    cover_url: coverUrl,
    season_year: null,
    start_date: null,
    trailer_youtube_id: null,
    description: null,
  };
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en", tmdbKeySet: true });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "get_anime_by_id") return Promise.resolve(animeMeta("https://example.com/old.jpg"));
    if (cmd === "get_anime_characters") return Promise.resolve([]);
    if (cmd === "get_anime_staff") return Promise.resolve([]);
    if (cmd === "get_tmdb_details")
      return Promise.resolve({
        title: "Show",
        overview: null,
        year: null,
        release_date: null,
        runtimeMinutes: null,
        genres: [],
        posters: [{ url: "https://example.com/old.jpg" }],
      });
    if (cmd === "get_tmdb_media") return Promise.resolve({ backdrops: [], trailerYoutubeId: null });
    return Promise.resolve(undefined);
  });
});

describe("refreshMetadata stale-thumb invalidation", () => {
  it("clears blob ids when the anilist cover URL changes", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_by_id")
        return Promise.resolve(animeMeta("https://example.com/new.jpg"));
      return Promise.resolve([]);
    });
    const updateItem = vi.fn();
    const { result } = renderHook(() => useCollectionMetadata(updateItem));
    await result.current.refreshMetadata(makeItem());
    expect(updateItem).toHaveBeenCalledTimes(1);
    const patch = updateItem.mock.calls[0][1] as Partial<CollectionItem>;
    expect(patch.coverUrl).toBe("https://example.com/new.jpg");
    expect(patch.coverBlobId).toBeNull();
    expect(patch.thumbBlobId).toBeNull();
  });

  it("keeps blob ids when the anilist cover URL is unchanged", async () => {
    const updateItem = vi.fn();
    const { result } = renderHook(() => useCollectionMetadata(updateItem));
    await result.current.refreshMetadata(makeItem());
    expect(updateItem).toHaveBeenCalledTimes(1);
    const patch = updateItem.mock.calls[0][1] as Partial<CollectionItem>;
    expect(patch.coverUrl).toBe("https://example.com/old.jpg");
    expect(patch).not.toHaveProperty("coverBlobId");
    expect(patch).not.toHaveProperty("thumbBlobId");
  });

  it("clears blob ids when the tmdb cover URL changes", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_tmdb_details")
        return Promise.resolve({
          title: "Show",
          overview: null,
          year: null,
          release_date: null,
          runtimeMinutes: null,
          genres: [],
          posters: [{ url: "https://example.com/new.jpg" }],
        });
      if (cmd === "get_tmdb_media")
        return Promise.resolve({ backdrops: [], trailerYoutubeId: null });
      return Promise.resolve(undefined);
    });
    const updateItem = vi.fn();
    const { result } = renderHook(() => useCollectionMetadata(updateItem));
    await result.current.refreshMetadata(makeItem({ type: "series", externalIds: { tmdb: 1 } }));
    const patch = updateItem.mock.calls[0][1] as Partial<CollectionItem>;
    expect(patch.coverUrl).toBe("https://example.com/new.jpg");
    expect(patch.coverBlobId).toBeNull();
    expect(patch.thumbBlobId).toBeNull();
  });

  it("keeps blob ids when the tmdb cover URL is unchanged", async () => {
    const updateItem = vi.fn();
    const { result } = renderHook(() => useCollectionMetadata(updateItem));
    await result.current.refreshMetadata(makeItem({ type: "series", externalIds: { tmdb: 1 } }));
    const patch = updateItem.mock.calls[0][1] as Partial<CollectionItem>;
    expect(patch.coverUrl).toBe("https://example.com/old.jpg");
    expect(patch).not.toHaveProperty("coverBlobId");
    expect(patch).not.toHaveProperty("thumbBlobId");
  });

  it("omits blob keys on URL change when no blobs are stored", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_by_id")
        return Promise.resolve(animeMeta("https://example.com/new.jpg"));
      return Promise.resolve([]);
    });
    const updateItem = vi.fn();
    const { result } = renderHook(() => useCollectionMetadata(updateItem));
    await result.current.refreshMetadata(makeItem({ coverBlobId: null, thumbBlobId: null }));
    const patch = updateItem.mock.calls[0][1] as Partial<CollectionItem>;
    expect(patch.coverUrl).toBe("https://example.com/new.jpg");
    expect(patch).not.toHaveProperty("coverBlobId");
    expect(patch).not.toHaveProperty("thumbBlobId");
  });
});
