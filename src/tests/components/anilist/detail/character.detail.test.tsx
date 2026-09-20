import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListCharacterDetailModal from "@/routes/components/anilist/detail/character.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniCharacterDetail, AniMedia, AniStaffDetail, AniVoiceActor } from "@/types/anilist";

/** The metadata block reads a good deal of the media object, so the fixture is complete. */
function ANIME(title: string): AniMedia {
  return {
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
    title,
    titles: [],
    trailer_youtube_id: null,
  };
}

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

const VOICE_ACTOR: AniVoiceActor = {
  id: 7,
  name: "Yuki Kaji",
  native_name: "梶裕貴",
  image: null,
  language: "Japanese",
};

const CHARACTER: AniCharacterDetail = {
  id: 40,
  name: "Eren Yeager",
  native_name: null,
  image: null,
  favourites: 10,
  site_url: null,
  media: [{ id: 21, title: "Attack on Titan", cover_url: null }],
};

const STAFF: AniStaffDetail = {
  id: 7,
  name: "Yuki Kaji",
  native_name: "梶裕貴",
  image: null,
  about: null,
  favourites: 5,
  site_url: null,
  character_count: 1,
  media_count: 0,
  characters: [],
  media: [],
};

function renderModal(
  overrides: {
    onCharacterFavouriteToggle?: (id: number) => void;
    onStaffFavouriteToggle?: (id: number) => void;
    onRelated?: (id: number) => void;
    initialStaff?: { id: number; name: string };
  } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handleCharacterFavouriteToggle = overrides.onCharacterFavouriteToggle;
  const handleStaffFavouriteToggle = overrides.onStaffFavouriteToggle;
  const handleRelated = overrides.onRelated;
  return render(
    <QueryClientProvider client={queryClient}>
      <AniListCharacterDetailModal
        characterId={40}
        characterName="Eren Yeager"
        voiceActors={[VOICE_ACTOR]}
        initialStaff={overrides.initialStaff}
        isLoggedIn
        favouriteCharacterIds={new Set()}
        favouriteStaffIds={new Set()}
        onCharacterFavouriteToggle={handleCharacterFavouriteToggle}
        onStaffFavouriteToggle={handleStaffFavouriteToggle}
        onRelated={handleRelated}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  );
}

function mockData() {
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_character_detail") return Promise.resolve(CHARACTER);
    if (command === "get_staff_characters") return Promise.resolve(STAFF);
    if (command === "get_anime_by_id") {
      return Promise.resolve(ANIME("Attack on Titan"));
    }
    return Promise.resolve(null);
  });
}

describe("AniListCharacterDetailModal", () => {
  it("opens on the character, with nowhere to go back to", async () => {
    mockData();
    renderModal();

    expect(await screen.findByRole("heading", { name: "Eren Yeager" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
  });

  it("stacks the voice actor over the character and returns with back", async () => {
    mockData();
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole("button", { name: "Yuki Kaji" }));

    expect(await screen.findByRole("heading", { name: "Yuki Kaji" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Eren Yeager" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByRole("heading", { name: "Eren Yeager" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
  });

  it("can be entered from a voice actor, keeping the character behind it", async () => {
    mockData();
    const user = userEvent.setup();
    renderModal({ initialStaff: { id: 7, name: "Yuki Kaji" } });

    expect(await screen.findByRole("heading", { name: "Yuki Kaji" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByRole("heading", { name: "Eren Yeager" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
  });

  it("stacks the anime over the character and leaves for the full modal from there", async () => {
    mockData();
    const onRelated = vi.fn();
    const user = userEvent.setup();
    renderModal({ onRelated });

    await user.click(await screen.findByRole("button", { name: "Attack on Titan" }));

    const openFull = await screen.findByRole("button", { name: "Open full details" });
    expect(document.querySelector(".line-clamp-1")?.textContent).toBe("Attack on Titan");
    expect(onRelated).not.toHaveBeenCalled();

    await user.click(openFull);
    expect(onRelated).toHaveBeenCalledWith(21);
  });

  it("sends the favourite toggle that belongs to the entry on screen", async () => {
    mockData();
    const onCharacterFavouriteToggle = vi.fn();
    const onStaffFavouriteToggle = vi.fn();
    const user = userEvent.setup();
    renderModal({ onCharacterFavouriteToggle, onStaffFavouriteToggle });

    await user.click(await screen.findByRole("button", { name: "Add to favourites" }));
    expect(onCharacterFavouriteToggle).toHaveBeenCalledWith(40);
    expect(onStaffFavouriteToggle).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yuki Kaji" }));
    await user.click(await screen.findByRole("button", { name: "Add to favourites" }));
    expect(onStaffFavouriteToggle).toHaveBeenCalledWith(7);
  });
});
