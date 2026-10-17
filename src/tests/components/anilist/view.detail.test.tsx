import { mockConvertFileSrc, mockInvoke as invokeMock } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import { AniListDetailView } from "@/routes/components/anilist/detail/view.detail";
import { patchSettings } from "@/store/settings.store";
import type { AniCharacterEdge, AniMedia } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

function edge(id: number, name: string): AniCharacterEdge {
  return {
    role: "MAIN",
    character: {
      id,
      name,
      native_name: null,
      image: null,
      favourites: null,
      site_url: null,
    },
    voice_actors: [],
  };
}

const ANIME = {
  id: 21,
  title: "T",
  titles: ["T"],
  studios: [],
  genres: [],
  tags: [],
  relations: [],
  description: null,
  rankings: [],
  cover_url: null,
  status: "FINISHED",
  format: "TV",
  episodes: 24,
  duration: 24,
  season: null,
  season_year: null,
  start_date: null,
  end_date: null,
  next_episode: null,
  next_airing_at: null,
  popularity: null,
  favourites: null,
  score: null,
} as unknown as AniMedia;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function renderView(isLoggedIn = false) {
  return render(
    <AniListDetailView
      animeId={21}
      isLoggedIn={isLoggedIn}
      favouriteIds={new Set()}
      onTag={() => undefined}
      onGenre={() => undefined}
      entryLookup={new Map()}
      onClose={() => undefined}
      onTrailer={() => undefined}
      anime={ANIME}
      initialCharacters={[edge(11, "Char One")]}
      initialRecommendations={[]}
      isLoading={false}
      isError={false}
      error={null}
      refetch={() => undefined}
    />,
    { wrapper }
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en", modalAnimation: false, anilistProxyUrl: null });
  invokeMock.mockReset();
  resetTransportInflight();
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anime_franchise") return Promise.resolve({ root_id: 21, nodes: [], edges: [] });
    if (command === "get_anime_recommendations") return Promise.resolve([]);
    if (command === "get_anilist_friend_scores") return Promise.resolve([]);
    if (command === "get_anilist_custom_lists") return Promise.resolve([]);
    if (command === "list_collection_items") return Promise.resolve([]);
    if (command === "list_custom_field_defs") return Promise.resolve([]);
    if (command === "list_collection_statuses") return Promise.resolve([]);
    if (command === "get_character_detail")
      return Promise.resolve({
        id: 11,
        name: "Char One",
        native_name: null,
        image: null,
        favourites: null,
        site_url: null,
        media: [],
      });
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("AniListDetailView character overlay", () => {
  it("opens the character inside the detail body with back and close controls", async () => {
    const user = userEvent.setup();
    renderView();
    const expanders = screen.getAllByRole("button", { name: "Expand section" });
    await user.click(expanders[0] as HTMLElement);
    await user.click(await screen.findByText("Char One"));
    expect(await screen.findByRole("button", { name: "Back" })).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});

describe("AniListDetailView mount inventory", () => {
  const EXPECTED_COMMANDS = [
    "get_anime_franchise",
    "get_anime_recommendations",
    "list_collection_items",
    "list_custom_field_defs",
    "list_collection_statuses",
  ];

  it("issues exactly one call per expected command and skips custom lists when logged out", async () => {
    renderView(false);

    await waitFor(() => {
      const commands = invokeMock.mock.calls.map(([command]) => String(command));
      for (const expected of EXPECTED_COMMANDS) {
        expect(commands).toContain(expected);
      }
    });

    const commands = invokeMock.mock.calls.map(([command]) => String(command));
    expect([...commands].sort()).toEqual([...EXPECTED_COMMANDS].sort());
  });

  it("asks for custom lists exactly once when logged in", async () => {
    renderView(true);

    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([command]) => command === "get_anilist_custom_lists"
      );
      expect(calls).toHaveLength(1);
    });
  });
});
