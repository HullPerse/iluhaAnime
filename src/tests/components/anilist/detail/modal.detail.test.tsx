// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@videojs/react/media/youtube-video", () => ({
  YouTubeVideo: ({ src }: { src: string }) => <div data-testid="youtube-player" data-src={src} />,
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ tmdbApiKey: null });
});

const ANIME = {
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
  trailer_youtube_id: "direct1",
} as AniMedia;

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AniListDetailModal
        animeId={21}
        isLoggedIn={false}
        onGenre={() => {}}
        onTag={() => {}}
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
}

describe("AniListDetailModal trailer", () => {
  it("shows the trailer in place and returns to details on back", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_by_id") return Promise.resolve(ANIME);
      if (cmd === "get_anime_characters") return Promise.resolve([]);
      if (cmd === "get_anime_franchise")
        return Promise.resolve({ edges: [], nodes: [], root_id: 21 });
      return Promise.resolve(null);
    });
    renderModal();
    await user.click(await screen.findByRole("button", { name: /Трейлер|Trailer/ }));
    const player = await screen.findByTestId("youtube-player");
    expect(player?.dataset.src).toContain("direct1");
    expect(player?.dataset.src).toContain("youtube-nocookie.com");
    expect(screen.getByRole("toolbar")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Трейлер|Trailer/ })).toBeNull();
    const back = document.querySelector(".lucide-chevron-left")?.closest("button");
    expect(back).not.toBeNull();
    await user.click(back as HTMLButtonElement);
    await vi.waitFor(() => expect(screen.queryByTestId("youtube-player")).toBeNull());
    expect(await screen.findByRole("button", { name: /Трейлер|Trailer/ })).toBeDefined();
  });

  it("shows no back button while the details are visible", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_by_id") return Promise.resolve(ANIME);
      if (cmd === "get_anime_characters") return Promise.resolve([]);
      if (cmd === "get_anime_franchise")
        return Promise.resolve({ edges: [], nodes: [], root_id: 21 });
      return Promise.resolve(null);
    });
    renderModal();
    await screen.findByRole("button", { name: /Трейлер|Trailer/ });
    expect(document.querySelector(".lucide-chevron-left")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Трейлер|Trailer/ }));
    await vi.waitFor(() =>
      expect(document.querySelector(".lucide-chevron-left")).not.toBeNull()
    );
  });
});
