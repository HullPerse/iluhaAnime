import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEDIA_PAGE_SIZE } from "@/config/anilist/pagination.config";
import { CharacterScreen } from "@/routes/components/anilist/detail/characterScreen.detail";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniCharacterDetail,
  AniListOverlayContext,
  AniListOverlayScreen,
} from "@/types/anilist";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

function mediaPage(count: number, startId: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: startId + index,
    title: `Anime ${startId + index}`,
    cover_url: null,
  }));
}

const PROFILE: AniCharacterDetail = {
  id: 40,
  name: "Eren Yeager",
  native_name: "エレン・イェーガー",
  image: null,
  favourites: 1234,
  site_url: "https://anilist.co/character/40",
  media: mediaPage(1, 100),
};

function renderScreen(overrides: {
  screen?: Extract<AniListOverlayScreen, { kind: "character" }>;
  onPush?: (screen: AniListOverlayScreen) => void;
  onCharacterFavouriteToggle?: (id: number) => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: AniListOverlayContext = {
    isLoggedIn: true,
    favouriteCharacterIds: new Set([40]),
    onCharacterFavouriteToggle: overrides.onCharacterFavouriteToggle,
    onOpenAnime: vi.fn(),
    onPush: overrides.onPush ?? vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <CharacterScreen
        screen={
          overrides.screen ?? {
            kind: "character",
            id: 40,
            name: "Eren Yeager",
            role: "MAIN",
            voiceActors: [
              {
                id: 7,
                name: "Yuki Kaji",
                native_name: "梶裕貴",
                image: null,
                language: "Japanese",
              },
            ],
          }
        }
        context={context}
      />
    </QueryClientProvider>
  );
}

describe("CharacterScreen", () => {
  it("waits before painting the profile", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    renderScreen({});

    expect(screen.getByLabelText("Loading")).toBeDefined();
    expect(screen.queryByText("Eren Yeager")).toBeNull();
  });

  it("shows the profile it loaded, with role, favourites and both lists", async () => {
    invokeMock.mockImplementation((command: string) =>
      command === "get_character_detail" ? Promise.resolve(PROFILE) : Promise.resolve(null)
    );
    renderScreen({});

    expect(await screen.findByRole("heading", { name: "Eren Yeager" })).toBeDefined();
    expect(screen.getByText("エレン・イェーガー")).toBeDefined();
    expect(screen.getByText("Main")).toBeDefined();
    expect(screen.getByText(/1[.,\s]?234/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Yuki Kaji" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Anime 100" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("falls back to the name it was opened with when the profile has none", async () => {
    invokeMock.mockImplementation((command: string) =>
      command === "get_character_detail" ? Promise.resolve(undefined) : Promise.resolve(null)
    );
    renderScreen({ screen: { kind: "character", id: 40, name: "From the card", voiceActors: [] } });

    expect(await screen.findByRole("heading", { name: "From the card" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("reports the failure and refetches on retry", async () => {
    invokeMock.mockRejectedValue(new Error("anilist is down"));
    renderScreen({});

    expect(await screen.findByText("anilist is down")).toBeDefined();

    invokeMock.mockImplementation((command: string) =>
      command === "get_character_detail" ? Promise.resolve(PROFILE) : Promise.resolve(null)
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Eren Yeager" })).toBeDefined();
  });

  it("pushes the staff screen from a voice actor and the anime screen from a credit", async () => {
    const onPush = vi.fn();
    invokeMock.mockImplementation((command: string) =>
      command === "get_character_detail" ? Promise.resolve(PROFILE) : Promise.resolve(null)
    );
    renderScreen({ onPush });

    await userEvent.setup().click(await screen.findByRole("button", { name: "Yuki Kaji" }));
    expect(onPush).toHaveBeenLastCalledWith({ kind: "staff", id: 7, name: "Yuki Kaji" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Anime 100" }));
    expect(onPush).toHaveBeenLastCalledWith({ kind: "anime", id: 100, name: "Anime 100" });
  });

  it("toggles the favourite through the header button", async () => {
    const onCharacterFavouriteToggle = vi.fn();
    invokeMock.mockImplementation((command: string) =>
      command === "get_character_detail" ? Promise.resolve(PROFILE) : Promise.resolve(null)
    );
    renderScreen({ onCharacterFavouriteToggle });

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Remove from favourites" }));
    expect(onCharacterFavouriteToggle).toHaveBeenCalledWith(40);
  });

  it("appends the next page of credits", async () => {
    let page = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command !== "get_character_detail") return Promise.resolve(null);
      page += 1;
      return Promise.resolve({
        ...PROFILE,
        media: page === 1 ? mediaPage(MEDIA_PAGE_SIZE, 200) : mediaPage(1, 900),
      });
    });
    renderScreen({});

    await userEvent.setup().click(await screen.findByRole("button", { name: "Show more" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Anime 900" })).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Anime 200" })).toBeDefined();
  });
});
