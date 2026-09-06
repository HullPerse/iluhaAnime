// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnilistStills } from "@/routes/components/anilist/stills.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ tmdbApiKey: "key" });
});

const ANIME = {
  id: 21,
  title: "One Piece",
  id_mal: 21,
  trailer_youtube_id: "direct1",
} as AniMedia;

function renderStills(anime: AniMedia = ANIME) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnilistStills anime={anime} />
    </QueryClientProvider>
  );
}

describe("AnilistStills", () => {
  it("prefers TMDB backdrops and trailer over direct fields", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "search_tmdb") return Promise.resolve([{ id: 5, media_type: "tv" }]);
      if (cmd === "get_tmdb_media")
        return Promise.resolve({
          backdrops: [{ url: "https://img/s1.jpg" }],
          trailerYoutubeId: "tmdb1",
        });
      return Promise.resolve(null);
    });
    renderStills();
    await user.click(await screen.findByRole("button", { name: /Трейлер|Trailer/ }));
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("tmdb1");
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Stills 1" }));
    await vi.waitFor(() => {
      expect(document.querySelector('img[src*="s1.jpg"]')).not.toBeNull();
    });
  });

  it("falls back to Jikan stills without a TMDB key", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ tmdbApiKey: null });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_stills") return Promise.resolve([{ url: "https://cdn/j1.jpg" }]);
      return Promise.resolve(null);
    });
    renderStills();
    await user.click(await screen.findByRole("button", { name: "Stills 1" }));
    await vi.waitFor(() => {
      expect(document.querySelector('img[src*="j1.jpg"]')).not.toBeNull();
    });
  });

  it("renders nothing without stills or trailer", async () => {
    useSettingsStore.setState({ tmdbApiKey: null });
    const { container } = renderStills({ ...ANIME, id_mal: null, trailer_youtube_id: null });
    await vi.waitFor(() => expect(container.firstChild).toBeNull());
  });
});
