import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import ImportAnilistCollection from "@/routes/components/collection/importAnilist.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListCollection, AniListEntry, AniMedia, AniUser } from "@/types/anilist";
import type { CollectionItem } from "@/types/collection";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@/hooks/collection/queries.hook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/collection/queries.hook")>();
  return {
    ...actual,
    useCollectionData: () => ({ items: mockedItems, statuses: [] }),
  };
});

let mockedItems: CollectionItem[] = [];

function collectionItem(id: string, anilistId: number, title: string): CollectionItem {
  return {
    id,
    title,
    altTitles: [],
    type: "anime",
    status: "watching",
    progressValue: 20,
    progressTotal: null,
    progressUnit: "episodes",
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: null,
    releaseDate: null,
    genres: [],
    studio: null,
    description: null,
    notes: null,
    coverUrl: null,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: { anilist: anilistId },
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
  };
}

const USER: AniUser = {
  id: 42,
  name: "Me",
  avatar: null,
  anime_count: 1,
  episodes_watched: 0,
  mean_score: null,
  score_format: null,
};

function media(id: number, title: string): AniMedia {
  return {
    id,
    title,
    titles: [title],
    episodes: null,
    duration: null,
    format: null,
    status: "RELEASING",
    score: null,
    genres: [],
    tags: [],
    description: null,
    cover_url: null,
    studios: [],
    next_episode: null,
    next_airing_at: null,
    start_date: null,
    end_date: null,
    season: null,
    season_year: null,
    popularity: null,
    favourites: null,
    rankings: [],
    relations: [],
  };
}

function entry(mediaId: number, title: string): AniListEntry {
  return {
    media: media(mediaId, title),
    progress: 20,
    score: 90,
    list_status: "currently_watching",
    created_at: null,
    completed_at: null,
    started_at: null,
    updated_at: null,
    notes: null,
    repeat: null,
    custom_lists: [],
  };
}

const LISTS: AniListCollection[] = [
  {
    name: "Watching",
    entries: [entry(101, "Frieren"), entry(102, "Vinland Saga")],
  },
];

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportAnilistCollection open onClose={vi.fn()} onImported={vi.fn()} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useSettingsStore.setState({ language: "en", anilistProxyUrl: null });
  invokeMock.mockReset();
  resetTransportInflight();
  mockedItems = [];
});

describe("ImportAnilistCollection query-driven views", () => {
  it("shows the login-required view when check_anilist_auth resolves null", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_anilist_auth") return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderModal();
    await waitFor(() => expect(screen.getByText("Please log in to AniList first")).toBeDefined());
    expect(invokeMock).not.toHaveBeenCalledWith("get_anilist_lists", expect.anything());
  });

  it("shows the empty view when the user has no lists", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_anilist_auth") {
        return Promise.resolve(USER);
      }
      if (command === "get_anilist_lists") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderModal();
    await waitFor(() => expect(screen.getByText("No lists found")).toBeDefined());
  });

  it("shows the lists fetch error instead of the summary", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_anilist_auth") {
        return Promise.resolve(USER);
      }
      if (command === "get_anilist_lists") {
        return Promise.reject(new Error("lists unavailable"));
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderModal();
    await waitFor(() => expect(screen.getByText("lists unavailable")).toBeDefined());
    expect(screen.queryByText("New: 1")).toBeNull();
  });

  it("shows the summary with the new-entry count and import action", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_anilist_auth") {
        return Promise.resolve(USER);
      }
      if (command === "get_anilist_lists") {
        return Promise.resolve(LISTS);
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderModal();
    await waitFor(() => expect(screen.getByText("New: 2")).toBeDefined());
    expect(screen.getByText("Already in collection: 0")).toBeDefined();
    const importButton = screen.getByRole("button", {
      name: "Import 2 new",
    }) as HTMLButtonElement;
    expect(importButton.disabled).toBe(false);
    const backfillButton = screen.getByRole("button", {
      name: "Update metadata from AniList",
    }) as HTMLButtonElement;
    expect(backfillButton.disabled).toBe(true);
  });

  it("backfills metadata with a single get_anime_by_ids call", async () => {
    mockedItems = [
      collectionItem("item-1", 101, "Frieren"),
      collectionItem("item-2", 102, "Vinland Saga"),
    ];
    invokeMock.mockImplementation((command: string) => {
      if (command === "check_anilist_auth") {
        return Promise.resolve(USER);
      }
      if (command === "get_anilist_lists") {
        return Promise.resolve(LISTS);
      }
      if (command === "get_anime_by_ids") {
        return Promise.resolve([
          { ...media(101, "Frieren"), episodes: 28, season_year: 2023 },
          { ...media(102, "Vinland Saga"), episodes: 24, season_year: 2019 },
        ]);
      }
      if (command === "patch_collection_item") {
        return Promise.resolve();
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderModal();
    const backfillButton = await screen.findByRole("button", {
      name: "Update metadata from AniList",
    });
    fireEvent.click(backfillButton);
    const startButton = await screen.findByRole("button", { name: "Update 2" });
    fireEvent.click(startButton);
    await waitFor(() => expect(screen.getByText("Metadata updated: 2")).toBeDefined());
    expect(invokeMock).toHaveBeenCalledWith(
      "get_anime_by_ids",
      expect.objectContaining({ ids: [101, 102] })
    );
    expect(invokeMock).not.toHaveBeenCalledWith("get_anime_by_id", expect.anything());
    const patches = invokeMock.mock.calls.filter(
      ([command]) => command === "patch_collection_item"
    );
    expect(patches).toHaveLength(2);
  });
});
