import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListFavouritesModal from "@/routes/components/anilist/favourites.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { FavouriteAnime, FavouritePeople } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command: string) => {
    if (command === "get_character_detail") {
      return Promise.resolve({
        id: 11,
        name: "Char One",
        native_name: null,
        image: null,
        favourites: null,
        site_url: null,
        media: [],
      });
    }
    if (command === "get_staff_characters") {
      return Promise.resolve({
        id: 22,
        name: "Staff One",
        native_name: null,
        image: null,
        about: null,
        favourites: null,
        site_url: null,
        character_count: 0,
        media_count: 0,
        characters: [],
        media: [],
      });
    }
    return Promise.resolve(null);
  }),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const ANIME: FavouriteAnime[] = [
  {
    id: 1,
    title: { romaji: "Anime One", english: null },
    cover_image: null,
    mean_score: 80,
    format: "TV",
  },
];

const PEOPLE: FavouritePeople = {
  staff: [{ id: 22, name: "Staff One", image: null }],
  characters: [{ id: 11, name: "Char One", image: null }],
};

const EMPTY_PEOPLE: FavouritePeople = { staff: [], characters: [] };

function renderModal(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function renderOpen(overrides: Partial<Parameters<typeof AniListFavouritesModal>[0]> = {}) {
  const onClose = vi.fn();
  const onAnimeClick = vi.fn();
  renderModal(
    <AniListFavouritesModal
      open
      favourites={ANIME}
      people={PEOPLE}
      isLoggedIn={false}
      onClose={onClose}
      onAnimeClick={onAnimeClick}
      {...overrides}
    />
  );
  return { onClose, onAnimeClick };
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("AniListFavouritesModal tabs", () => {
  it("renders nothing when closed", () => {
    renderModal(
      <AniListFavouritesModal
        open={false}
        favourites={ANIME}
        people={PEOPLE}
        isLoggedIn={false}
        onClose={vi.fn()}
        onAnimeClick={vi.fn()}
      />
    );
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows the anime tab first with counts on every tab", () => {
    renderOpen();
    expect(screen.getByRole("tab", { name: "Anime (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Characters (1)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Staff (1)" })).toBeTruthy();
    expect(screen.getByText("Anime One")).toBeTruthy();
    expect(screen.queryByText("Char One")).toBeNull();
  });

  it("switches to the characters tab on click", () => {
    renderOpen();
    fireEvent.click(screen.getByRole("tab", { name: "Characters (1)" }));
    expect(screen.getByText("Char One")).toBeTruthy();
    expect(screen.queryByText("Anime One")).toBeNull();
  });

  it("switches tabs with ArrowRight on the tablist", () => {
    renderOpen();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByText("Char One")).toBeTruthy();
  });

  it("shows a per-tab empty state", () => {
    renderOpen({ people: EMPTY_PEOPLE });
    fireEvent.click(screen.getByRole("tab", { name: "Staff (0)" }));
    expect(screen.getByText("No favourite staff")).toBeTruthy();
  });

  it("opens anime details through close plus click", () => {
    const { onClose, onAnimeClick } = renderOpen();
    fireEvent.click(screen.getByText("Anime One"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnimeClick).toHaveBeenCalledWith(1);
  });

  it("opens the character overlay on top without closing favourites", async () => {
    const { onClose } = renderOpen();
    fireEvent.click(screen.getByRole("tab", { name: "Characters (1)" }));
    fireEvent.click(screen.getByText("Char One"));
    await waitFor(() => {
      expect(screen.getAllByText("Char One").length).toBeGreaterThan(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the staff overlay on top without closing favourites", async () => {
    const { onClose } = renderOpen();
    fireEvent.click(screen.getByRole("tab", { name: "Staff (1)" }));
    fireEvent.click(screen.getByText("Staff One"));
    await waitFor(() => {
      expect(screen.getAllByText("Staff One").length).toBeGreaterThan(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
