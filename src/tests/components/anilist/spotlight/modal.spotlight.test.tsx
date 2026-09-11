import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SpotlightModal from "@/routes/components/anilist/spotlight/modal.spotlight";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
function media(id: number, title: string): AniMedia {
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
    description: null,
    cover_url: null,
    season: null,
    season_year: 2020,
    studios: [],
    id_mal: null,
    trailer_youtube_id: null,
    next_episode: null,
    next_airing_at: null,
    start_date: null,
    end_date: null,
    popularity: null,
    favourites: null,
    rankings: [],
    relations: [],
  };
}
function cacheKey(args: unknown): string {
  if (args && typeof args === "object" && "key" in args) return String(args.key);
  return "";
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SpotlightModal", () => {
  it("shows the login panel without fetching when logged out", () => {
    render(
      createElement(SpotlightModal, {
        hasUser: false,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    expect(screen.getByText(/requires login/)).toBeTruthy();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("loads one pick per period and caches the results", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      if (command === "get_spotlight_page")
        return Promise.resolve({ media: [media(21, "One Piece"), media(5114, "FMA")], total: 100 });
      return Promise.resolve(true);
    });
    render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(screen.getAllByText("One Piece").length).toBeGreaterThan(0));
    const puts = invokeMock.mock.calls.filter((call) => call[0] === "put_app_cache");
    expect(puts.length).toBeGreaterThanOrEqual(3);
  });

  it("shows the error state with retry on backend failure", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      return Promise.reject(new Error("offline"));
    });
    render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(screen.getAllByText("Could not load spotlight.")).toHaveLength(3));
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      if (command === "get_spotlight_page")
        return Promise.resolve({ media: [media(21, "One Piece")], total: 1 });
      return Promise.resolve(true);
    });
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    await waitFor(() => expect(screen.getAllByText("One Piece").length).toBeGreaterThan(0));
  });

  it("opens details on row click", async () => {
    const user = userEvent.setup();
    const onDetails = vi.fn();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      if (command === "get_spotlight_page")
        return Promise.resolve({ media: [media(21, "One Piece")], total: 1 });
      return Promise.resolve(true);
    });
    render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails,
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(screen.getAllByText("One Piece").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("button", { name: "Details" })[0]);
    expect(onDetails).toHaveBeenCalled();
  });
  it("reads cached totals before fetching pages", async () => {
    const readKeys: string[] = [];
    invokeMock.mockImplementation((command: string, args: unknown) => {
      if (command === "get_app_cache") {
        const key = cacheKey(args);
        readKeys.push(key);
        if (key.startsWith("total:")) return Promise.resolve({ payload: "5000" });
        return Promise.resolve(null);
      }
      if (command === "get_spotlight_page")
        return Promise.resolve({ media: [media(21, "One Piece")], total: 5000 });
      return Promise.resolve(true);
    });
    render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(screen.getAllByText("One Piece").length).toBeGreaterThan(0));
    expect(readKeys.filter((key) => String(key).startsWith("total:")).length).toBe(3);
  });

  it("shows the error state when the pool is empty", async () => {
    invokeMock.mockImplementation((command: string, args: unknown) => {
      if (command === "get_app_cache") {
        const key = cacheKey(args);
        if (key.startsWith("total:")) return Promise.resolve({ payload: "0" });
        return Promise.resolve(null);
      }
      if (command === "get_spotlight_page") return Promise.resolve({ media: [], total: 0 });
      return Promise.resolve(true);
    });
    render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(screen.getAllByText("Could not load spotlight.")).toHaveLength(3));
  });

  it("renders a refresh countdown per row", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      if (command === "get_spotlight_page")
        return Promise.resolve({ media: [media(21, "One Piece")], total: 1 });
      return Promise.resolve(true);
    });
    render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(screen.getAllByText(/Refreshes in/)).toHaveLength(3));
  });

  it("survives unmount while rows are loading", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      if (command === "get_spotlight_page")
        return Promise.resolve({ media: [media(1, "Pending")], total: 1 });
      return Promise.resolve(true);
    });
    const { unmount } = render(
      createElement(SpotlightModal, {
        hasUser: true,
        onDetails: vi.fn(),
        isFavorite: () => false,
        onClose: vi.fn(),
      }),
      { wrapper }
    );
    unmount();
    await Promise.resolve();
  });
});
