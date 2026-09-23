import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AniListDetailView } from "@/routes/components/anilist/detail/view.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniDetailViewProps } from "@/types/anilist";
import type { AniMedia } from "@/types/anilist";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

function props(overrides: Partial<AniDetailViewProps> = {}): AniDetailViewProps {
  return {
    anime: undefined,
    animeId: 21,
    error: null,
    isError: false,
    isLoading: true,
    isLoggedIn: false,
    onClose: () => {},
    onGenre: () => {},
    onTag: () => {},
    onTrailer: () => {},
    refetch: () => {},
    ...overrides,
  };
}

function renderView(viewProps: AniDetailViewProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AniListDetailView {...viewProps} />
    </QueryClientProvider>
  );
}

const TRAILER_ANIME: AniMedia = {
  id: 21,
  title: "One Piece",
  titles: [],
  episodes: 11,
  duration: 24,
  format: "TV",
  status: "FINISHED",
  score: 84,
  genres: [],
  tags: [],
  description: null,
  cover_url: null,
  id_mal: null,
  trailer_youtube_id: "t1",
  season: null,
  season_year: null,
  studios: [],
  next_episode: null,
  next_airing_at: null,
  start_date: null,
  end_date: null,
  popularity: 100,
  favourites: 10,
  rankings: [],
  relations: [],
};

describe("AniListDetailView loading", () => {
  it("centers the loader while the detail query is pending", () => {
    renderView(props());
    const loader = document.querySelector(".ui-loading-spinner");
    expect(loader).not.toBeNull();
    const box = loader?.closest("div");
    expect(box?.className).toContain("items-center");
    expect(box?.className).toContain("justify-center");
    expect(box?.className).toContain("min-h-48");
  });

  it("centers the loader when the query settled without data", () => {
    renderView(props({ isLoading: false }));
    const loader = document.querySelector(".ui-loading-spinner");
    expect(loader?.closest("div")?.className).toContain("justify-center");
  });
});

describe("AniListDetailView auth-gated error", () => {
  it("shows the login hint to logged-out users on HTTP 403", () => {
    renderView(
      props({
        isError: true,
        isLoading: false,
        error: new Error("AniList HTTP 403: AniList disabled anonymous access."),
      })
    );
    expect(document.body.textContent).toMatch(/requires login|требует вход/);
  });

  it("shows the raw error to logged-in users on HTTP 403", () => {
    renderView(
      props({
        isError: true,
        isLoading: false,
        isLoggedIn: true,
        error: new Error("AniList HTTP 403"),
      })
    );
    expect(document.body.textContent).toContain("AniList HTTP 403");
  });
});

describe("AniListDetailView character window", () => {
  it("opens a voice actor's screen from the card under their character", async () => {
    useSettingsStore.setState({ language: "en" });
    const voiceActor = {
      id: 7,
      name: "Yuki Kaji",
      native_name: "梶裕貴",
      image: null,
      language: "Japanese",
    };
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_anime_characters") {
        return Promise.resolve([
          {
            role: "MAIN",
            character: { id: 40, name: "Eren Yeager", image: null },
            voice_actors: [voiceActor],
          },
        ]);
      }
      if (command === "get_character_detail") {
        return Promise.resolve({
          id: 40,
          name: "Eren Yeager",
          native_name: null,
          image: null,
          favourites: 1,
          site_url: null,
          media: [],
        });
      }
      if (command === "get_staff_characters") {
        return Promise.resolve({
          id: 7,
          name: "Yuki Kaji",
          native_name: "梶裕貴",
          image: null,
          about: null,
          favourites: 1,
          site_url: null,
          character_count: 0,
          media_count: 0,
          characters: [],
          media: [],
        });
      }
      return Promise.resolve(null);
    });
    const user = userEvent.setup();
    renderView(props({ anime: TRAILER_ANIME, isLoading: false, isLoggedIn: true }));

    const characters = await screen.findByRole("region", { name: "Characters" });
    await user.click(within(characters).getByRole("button", { name: "Expand section" }));
    await user.hover(await within(characters).findByRole("button", { name: "Eren Yeager" }));
    await user.click(await screen.findByRole("button", { name: "Yuki Kaji" }, { timeout: 3000 }));

    expect(await screen.findByRole("heading", { name: "Yuki Kaji" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByRole("heading", { name: "Eren Yeager" })).toBeDefined();
  });
});

describe("AniListDetailView header trailer", () => {
  it("opens the trailer from the bottom-right header button", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ tmdbKeySet: true });
    const onTrailer = vi.fn();
    renderView(props({ anime: TRAILER_ANIME, isLoading: false, onTrailer }));
    await user.click(await screen.findByRole("button", { name: /Трейлер|Trailer/ }));
    expect(onTrailer).toHaveBeenCalledWith("t1");
  });

  it("shows no trailer button without a trailer id", async () => {
    useSettingsStore.setState({ tmdbKeySet: false });
    renderView(props({ anime: { ...TRAILER_ANIME, trailer_youtube_id: null }, isLoading: false }));
    await screen.findByText("One Piece");
    expect(screen.queryByRole("button", { name: /Трейлер|Trailer/ })).toBeNull();
  });
});
