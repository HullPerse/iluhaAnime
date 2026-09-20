import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAFF_CREDITS_PAGE_SIZE } from "@/config/anilist/pagination.config";
import { StaffScreen } from "@/routes/components/anilist/detail/staffScreen.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListOverlayContext, AniListOverlayScreen, AniStaffDetail } from "@/types/anilist";

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

function page(overrides: Partial<AniStaffDetail>): AniStaffDetail {
  return {
    id: 7,
    name: "Yuki Kaji",
    native_name: "梶裕貴",
    image: null,
    about: null,
    favourites: null,
    site_url: null,
    character_count: 0,
    media_count: 0,
    characters: [],
    media: [],
    ...overrides,
  };
}

const CHARACTERS_PAGE = page({
  about: "<b>Born in Tokyo</b><br>Voiced many leads",
  character_count: 120,
  favourites: 999,
  media_count: 88,
  site_url: "https://anilist.co/staff/7",
  characters: [{ id: 5, name: "Eren Yeager", image: null }],
});

const MEDIA_PAGE = page({
  media_count: 88,
  media: [{ id: 21, title: "Attack on Titan", cover_url: null }],
});

/** Page one is whatever asks first (characters, then media); later pages are told apart by args. */
function dispatch(
  charactersPage: AniStaffDetail = CHARACTERS_PAGE,
  charactersNext: AniStaffDetail = page({})
) {
  let firstCall = 0;
  return (command: string, args?: Record<string, unknown>) => {
    if (command !== "get_staff_characters") return Promise.resolve(null);
    const charPage = typeof args?.charPage === "number" ? args.charPage : 1;
    const mediaPage = typeof args?.page === "number" ? args.page : 1;
    if (charPage > 1) return Promise.resolve(charactersNext);
    if (mediaPage > 1) return Promise.resolve(page({}));
    firstCall += 1;
    return Promise.resolve(firstCall === 1 ? charactersPage : MEDIA_PAGE);
  };
}

function renderScreen(
  overrides: {
    onPush?: (screen: AniListOverlayScreen) => void;
    onStaffFavouriteToggle?: (id: number) => void;
  } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const context: AniListOverlayContext = {
    isLoggedIn: true,
    favouriteCharacterIds: new Set([5]),
    favouriteStaffIds: new Set([7]),
    onStaffFavouriteToggle: overrides.onStaffFavouriteToggle,
    onOpenAnime: vi.fn(),
    onPush: overrides.onPush ?? vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <StaffScreen screen={{ kind: "staff", id: 7, name: "Yuki Kaji" }} context={context} />
    </QueryClientProvider>
  );
}

describe("StaffScreen", () => {
  it("waits until both lists settle", () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    renderScreen();

    expect(screen.getByLabelText("Loading")).toBeDefined();
  });

  it("shows the profile, the collapsed bio and both credits with their totals", async () => {
    invokeMock.mockImplementation(dispatch());
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Yuki Kaji" })).toBeDefined();
    expect(screen.getByText("梶裕貴")).toBeDefined();
    expect(screen.getByText(/999/)).toBeDefined();
    expect(screen.getByText("Characters (120)")).toBeDefined();
    expect(screen.getByText("Anime (88)")).toBeDefined();
    expect(screen.getByRole("button", { name: "Attack on Titan" })).toBeDefined();

    // Collapsed, the bio keeps only its first line; expanding reveals the rest.
    expect(screen.getByText("Born in Tokyo")).toBeDefined();
    expect(screen.queryByText("Voiced many leads")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Expand section" }));
    expect(screen.getByText(/Born in Tokyo.*Voiced many leads/s)).toBeDefined();
  });

  it("pushes the character screen with no voice actors of its own", async () => {
    const onPush = vi.fn();
    invokeMock.mockImplementation(dispatch());
    renderScreen({ onPush });

    await userEvent.setup().click(await screen.findByRole("button", { name: "Eren Yeager" }));

    expect(onPush).toHaveBeenCalledWith({
      kind: "character",
      id: 5,
      name: "Eren Yeager",
      voiceActors: [],
    });
  });

  it("pages the character credits on their own", async () => {
    invokeMock.mockImplementation(
      dispatch(
        page({
          character_count: 120,
          characters: Array.from({ length: STAFF_CREDITS_PAGE_SIZE }, (_, index) => ({
            id: 300 + index,
            name: `Filler ${index}`,
            image: null,
          })),
        }),
        page({
          character_count: 120,
          characters: [{ id: 900, name: "Next page character", image: null }],
        })
      )
    );
    renderScreen();

    const charactersSection = await screen.findByLabelText("Characters (120)");
    await userEvent
      .setup()
      .click(within(charactersSection).getByRole("button", { name: "Show more" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next page character" })).toBeDefined();
    });
    expect(screen.getByRole("button", { name: "Filler 0" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("reports a total failure once and refetches both lists", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    renderScreen();

    expect(await screen.findByText("Failed to load data")).toBeDefined();

    invokeMock.mockImplementation(dispatch());
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Yuki Kaji" })).toBeDefined();
  });
});
