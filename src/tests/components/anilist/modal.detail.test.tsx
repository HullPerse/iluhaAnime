import { mockConvertFileSrc, mockInvoke as invokeMock } from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
import { patchSettings } from "@/store/settings.store";
import type { AniCharacterEdge, AniMedia } from "@/types/anilist/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

const MEDIA = {
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

const OTHER_ANIME = {
  ...MEDIA,
  id: 31,
  title: "Anime X",
  titles: ["Anime X"],
} as AniMedia;

const CHARACTER_EDGE: AniCharacterEdge = {
  role: "MAIN",
  character: {
    id: 11,
    name: "Char One",
    native_name: null,
    image: null,
    favourites: null,
    site_url: null,
  },
  voice_actors: [],
};

const wrapper = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
};

const renderModal = (onRelated = vi.fn()) => {
  render(
    <AniListDetailModal
      animeId={21}
      isLoggedIn={false}
      onTag={() => undefined}
      onGenre={() => undefined}
      onRelated={onRelated}
      onClose={() => undefined}
    />,
    { wrapper }
  );
  return onRelated;
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({
    language: "en",
    modalAnimation: false,
    anilistProxyUrl: null,
    animeDetailWidth: "default",
  });
  invokeMock.mockReset();
  resetTransportInflight();
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anime_full") {
      return Promise.resolve({
        media: MEDIA,
        characters: [CHARACTER_EDGE],
        staff: [],
        recommendations: [],
      });
    }
    if (command === "get_anime_by_id") return Promise.resolve(OTHER_ANIME);
    if (command === "get_anime_franchise") {
      return Promise.resolve({ root_id: 21, nodes: [], edges: [] });
    }
    if (command === "get_anime_recommendations") return Promise.resolve([]);
    if (command === "get_anilist_friend_scores") return Promise.resolve([]);
    if (command === "list_collection_items") return Promise.resolve([]);
    if (command === "list_custom_field_defs") return Promise.resolve([]);
    if (command === "list_collection_statuses") return Promise.resolve([]);
    if (command === "get_character_detail") {
      return Promise.resolve({
        id: 11,
        name: "Char One",
        native_name: null,
        image: null,
        favourites: null,
        site_url: null,
        media: [{ id: 31, title: "Anime X", cover_url: null }],
      });
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("AniListDetailModal width", () => {
  it("keeps the default width until the setting asks for more", async () => {
    renderModal();

    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());
    expect(screen.getByRole("dialog").className).toContain("min-w-2xl");
    expect(screen.getByRole("dialog").className).not.toContain("min-w-4xl");

    patchSettings({ animeDetailWidth: "wide" });
    await waitFor(() =>
      expect(screen.getByRole("dialog").className).toContain("min-w-4xl max-w-[92%]")
    );
    expect(screen.getByRole("dialog").className).not.toContain("min-w-2xl");
  });
});

const openCharacter = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "T" })).toBeDefined());
  const expanders = screen.getAllByRole("button", { name: "Expand section" });
  await user.click(expanders[0] as HTMLElement);
  await user.click(await screen.findByText("Char One"));
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2, name: "Char One" })).toBeDefined()
  );
};

describe("AniListDetailModal content stack", () => {
  it("shows the character in the modal titlebar and returns to the anime on back", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "T" })).toBeDefined());

    await openCharacter(user);

    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
    expect(screen.queryAllByRole("button", { name: "Expand section" })).toHaveLength(0);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "T" })).toBeDefined());
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Expand section" }).length).toBeGreaterThan(0);
  });

  it("pushes the anime preview and opens it through the shell stack", async () => {
    const user = userEvent.setup();
    const onRelated = renderModal();
    await openCharacter(user);

    await user.click(await screen.findByText("Anime X"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Anime X" })).toBeDefined()
    );

    await user.click(screen.getByRole("button", { name: "Open full details" }));

    expect(onRelated).toHaveBeenCalledWith(31);
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "T" })).toBeDefined());
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});
