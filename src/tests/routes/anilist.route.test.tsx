import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnilistRoute from "@/routes/anilist.route";
import { useDeepLinkStore } from "@/store/deeplink.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const user = {
  id: 1,
  name: "TestUser",
  avatar: null,
  anime_count: 0,
  episodes_watched: 0,
  mean_score: null,
};

const ACTIVITY_TITLE = "Activity and history";
const ACTIVITY_BUTTON = "Activity history";

function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnilistRoute />
    </QueryClientProvider>
  );
}

function emptyListInvoke(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "check_anilist_auth": {
      return Promise.resolve(user);
    }
    case "get_anilist_lists": {
      return Promise.resolve([]);
    }
    case "get_favourites": {
      return Promise.resolve([]);
    }
    case "sync_franchise_to_index": {
      return Promise.resolve(null);
    }
    case "get_anilist_activity": {
      return Promise.resolve([]);
    }
    default: {
      return Promise.resolve(null);
    }
  }
}

function listInvoke(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "check_anilist_auth": {
      return Promise.resolve(user);
    }
    case "get_anilist_lists": {
      return Promise.resolve([{ name: "Watching", isCustomList: false, entries: [] }]);
    }
    case "get_favourites": {
      return Promise.resolve([]);
    }
    case "sync_franchise_to_index": {
      return Promise.resolve(null);
    }
    case "get_anilist_activity": {
      return Promise.resolve([]);
    }
    default: {
      return Promise.resolve(null);
    }
  }
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(emptyListInvoke);
});

describe("AnilistRoute activity modal", () => {
  it("does not auto-open the activity modal when the tab loads", async () => {
    renderRoute();
    await screen.findByText("TESTUSER");
    expect(screen.queryByText(ACTIVITY_TITLE)).toBeNull();
  });

  it("opens the activity modal only after clicking the activity button", async () => {
    mockInvoke.mockImplementation(listInvoke);
    const userEventInstance = userEvent.setup();
    renderRoute();
    await screen.findByText("TESTUSER");
    expect(screen.queryByText(ACTIVITY_TITLE)).toBeNull();

    const buttons = screen.getAllByRole("button", {
      name: ACTIVITY_BUTTON,
    });
    await userEventInstance.click(buttons[0]!);
    expect(await screen.findByText(ACTIVITY_TITLE)).toBeTruthy();
  });
});

const PICK_ANIME = {
  cover_url: null,
  description: null,
  duration: null,
  end_date: null,
  episodes: null,
  favourites: null,
  format: null,
  genres: [],
  id: 21,
  id_mal: null,
  next_airing_at: null,
  next_episode: null,
  popularity: null,
  rankings: [],
  relations: [],
  score: null,
  season: null,
  season_year: null,
  start_date: null,
  status: "FINISHED",
  studios: [],
  tags: [],
  title: "One Piece",
  titles: [],
  trailer_youtube_id: null,
} as AniMedia;

function randomPoolInvoke(cmd: string): Promise<unknown> {
  switch (cmd) {
    case "check_anilist_auth": {
      return Promise.resolve(user);
    }
    case "get_anilist_lists": {
      return Promise.resolve([]);
    }
    case "get_favourites": {
      return Promise.resolve([]);
    }
    case "get_favourite_people": {
      return Promise.resolve({ staff: [], characters: [] });
    }
    case "get_anilist_activity": {
      return Promise.resolve([]);
    }
    case "get_anilist_filter_page": {
      return Promise.resolve({ media: [{ id: 21 }], total: 1 });
    }
    case "get_anime_by_id": {
      return Promise.resolve(PICK_ANIME);
    }
    case "get_anime_characters": {
      return Promise.resolve([]);
    }
    case "get_anime_franchise": {
      return Promise.resolve({ edges: [], nodes: [], root_id: 21 });
    }
    default: {
      return Promise.resolve(null);
    }
  }
}

describe("AnilistRoute filter random", () => {
  it("opens the picked anime over the filters and returns on back", async () => {
    mockInvoke.mockImplementation(randomPoolInvoke);
    const viewer = userEvent.setup();
    const { container } = renderRoute();
    await screen.findByText("TESTUSER");
    await viewer.click(container.querySelector('button[title="Filters"]')!);
    await screen.findByText("Search filters");
    const randomButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "Random");
    expect(randomButton).toBeTruthy();
    await viewer.click(randomButton!);
    const titles = await screen.findAllByText("One Piece");
    expect(titles.length).toBeGreaterThan(0);
    const pageCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "get_anilist_filter_page");
    expect(pageCalls.length).toBeGreaterThanOrEqual(1);
    expect(pageCalls[0]?.[1]?.page).toBe(1);
    const back = document.querySelector(".lucide-chevron-left")?.closest("button");
    expect(back).not.toBeNull();
    await viewer.click(back as HTMLButtonElement);
    await vi.waitFor(() => expect(screen.queryByText("One Piece")).toBeNull());
    expect(screen.getByText("Search filters")).toBeTruthy();
  });

  it("stays on the filters when the pool is empty", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anilist_filter_page") return Promise.resolve({ media: [], total: 0 });
      return randomPoolInvoke(cmd);
    });
    const viewer = userEvent.setup();
    const { container } = renderRoute();
    await screen.findByText("TESTUSER");
    await viewer.click(container.querySelector('button[title="Filters"]')!);
    await screen.findByText("Search filters");
    const randomButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "Random");
    await viewer.click(randomButton!);
    await vi.waitFor(() =>
      expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "get_anilist_filter_page")).toBe(true)
    );
    expect(screen.queryByText("One Piece")).toBeNull();
    expect(screen.getByText("Search filters")).toBeTruthy();
  });

  it("notifies on first-call failure and keeps the filters open", async () => {
    useNotificationStore.setState({ items: [] });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anilist_filter_page") return Promise.reject(new Error("offline"));
      return randomPoolInvoke(cmd);
    });
    const viewer = userEvent.setup();
    const { container } = renderRoute();
    await screen.findByText("TESTUSER");
    await viewer.click(container.querySelector('button[title="Filters"]')!);
    await screen.findByText("Search filters");
    const randomButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "Random");
    await viewer.click(randomButton!);
    await vi.waitFor(() =>
      expect(
        useNotificationStore.getState().items.some((item) => item.message === "Random pick failed")
      ).toBe(true)
    );
    expect(screen.queryByText("One Piece")).toBeNull();
    expect(screen.getByText("Search filters")).toBeTruthy();
  });

  it("fetches a random page when the pool spans pages", async () => {
    const pages: unknown[] = [];
    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "get_anilist_filter_page") {
        const page = (args as { page?: unknown }).page;
        pages.push(page);
        if (page === 3) return Promise.resolve({ media: [{ id: 77 }], total: 120 });
        return Promise.resolve({ media: [{ id: 21 }], total: 120 });
      }
      if (cmd === "get_anime_by_id") {
        const id = (args as { id?: unknown }).id;
        return Promise.resolve({ ...PICK_ANIME, id, title: id === 77 ? "Bleach" : "One Piece" });
      }
      return randomPoolInvoke(cmd);
    });
    const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.9);
    try {
      const viewer = userEvent.setup();
      const { container } = renderRoute();
      await screen.findByText("TESTUSER");
      await viewer.click(container.querySelector('button[title="Filters"]')!);
      await screen.findByText("Search filters");
      const randomButton = screen
        .getAllByRole("button")
        .find((button) => button.textContent === "Random");
      await viewer.click(randomButton!);
      await screen.findAllByText("Bleach");
      expect(pages).toEqual([1, 3]);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("notifies when the random page fetch fails", async () => {
    useNotificationStore.setState({ items: [] });
    mockInvoke.mockImplementation((cmd: string, args: unknown) => {
      if (cmd === "get_anilist_filter_page") {
        if ((args as { page?: unknown }).page === 1)
          return Promise.resolve({ media: [{ id: 21 }], total: 120 });
        return Promise.reject(new Error("offline"));
      }
      return randomPoolInvoke(cmd);
    });
    const randomSpy = vi.spyOn(Math, "random").mockReturnValueOnce(0.9);
    try {
      const viewer = userEvent.setup();
      const { container } = renderRoute();
      await screen.findByText("TESTUSER");
      await viewer.click(container.querySelector('button[title="Filters"]')!);
      await screen.findByText("Search filters");
      const randomButton = screen
        .getAllByRole("button")
        .find((button) => button.textContent === "Random");
      await viewer.click(randomButton!);
      await vi.waitFor(() =>
        expect(
          useNotificationStore
            .getState()
            .items.some((item) => item.message === "Random pick failed")
        ).toBe(true)
      );
      expect(screen.queryByText("One Piece")).toBeNull();
      expect(screen.getByText("Search filters")).toBeTruthy();
    } finally {
      randomSpy.mockRestore();
    }
  });
});

describe("AnilistRoute list random", () => {
  it("opens a random entry from the current list", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anilist_lists") {
        return Promise.resolve([
          {
            name: "Watching",
            isCustomList: false,
            entries: [{ media: PICK_ANIME, progress: 1, score: 8, list_status: "CURRENT" }],
          },
        ]);
      }
      return randomPoolInvoke(cmd);
    });
    const viewer = userEvent.setup();
    const { container } = renderRoute();
    await screen.findByText("TESTUSER");
    await viewer.click(container.querySelector('button[title="Random from list"]')!);
    await screen.findAllByText("One Piece");
  });

  it("does nothing when the current list is empty", async () => {
    mockInvoke.mockImplementation(randomPoolInvoke);
    const viewer = userEvent.setup();
    const { container } = renderRoute();
    await screen.findByText("TESTUSER");
    await viewer.click(container.querySelector('button[title="Random from list"]')!);
    await Promise.resolve();
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "get_anime_by_id")).toBe(false);
    expect(screen.queryByText("One Piece")).toBeNull();
  });
});

describe("AnilistRoute deep link", () => {
  it("opens the linked anime and consumes the target", async () => {
    mockInvoke.mockImplementation(randomPoolInvoke);
    useDeepLinkStore.setState({ target: { id: 21, source: "anilist" } });
    renderRoute();
    await screen.findAllByText("One Piece");
    expect(useDeepLinkStore.getState().target).toBeNull();
  });

  it("opens a link arriving while the route is already mounted", async () => {
    mockInvoke.mockImplementation(randomPoolInvoke);
    useDeepLinkStore.setState({ target: null });
    renderRoute();
    await screen.findByText("TESTUSER");
    expect(screen.queryByText("One Piece")).toBeNull();
    useDeepLinkStore.setState({ target: { id: 21, source: "anilist" } });
    await screen.findAllByText("One Piece");
    expect(useDeepLinkStore.getState().target).toBeNull();
  });
});
