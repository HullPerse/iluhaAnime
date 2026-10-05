import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { primeAnimeBrief } from "@/hooks/anilist/anime-brief.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import AnimeCard from "@/routes/components/lobby/anime-card.lobby";
import { useSettingsStore } from "@/store/settings.store";
import type { AniMedia, AnilistRouteData, AniUser } from "@/types/anilist";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function media(overrides: Partial<AniMedia> = {}): AniMedia {
  return {
    banner_image: null,
    cover_url: "https://s4.anilist.co/file/cover.jpg",
    description: null,
    duration: null,
    end_date: null,
    episodes: 24,
    favourites: null,
    format: "TV",
    genres: [],
    id: 21,
    id_mal: null,
    next_airing_at: null,
    next_episode: null,
    popularity: null,
    rankings: [],
    relations: [],
    score: 87,
    season: null,
    season_year: 1999,
    start_date: null,
    status: "FINISHED",
    studios: [],
    tags: [],
    title: "Flat Fallback",
    title_english: "One Piece",
    title_native: "ワンピース",
    title_romaji: "Wan Pisu",
    titles: [],
    trailer_youtube_id: null,
    ...overrides,
  };
}

function accountUser(overrides: Partial<AniUser> = {}): AniUser {
  return {
    id: 1,
    name: "Tester",
    avatar: null,
    anime_count: 0,
    episodes_watched: 0,
    mean_score: null,
    score_format: null,
    title_language: "native",
    ...overrides,
  };
}

function card(
  overrides: {
    animeId?: number;
    initialBrief?: AniMedia | null;
    preference?: "english" | "account";
    seedAccount?: AniUser | null;
  } = {}
) {
  const onOpenInternal = vi.fn();
  const onOpenExternal = vi.fn();
  useSettingsStore.setState({
    anilistTitleLanguage: overrides.preference ?? "english",
  });
  if (overrides.seedAccount !== undefined && overrides.seedAccount !== null) {
    client.setQueryData(queryKeys.anilistData(), {
      user: overrides.seedAccount,
    } as AnilistRouteData);
  }
  const view = render(
    <AnimeCard
      animeId={overrides.animeId ?? 21}
      initialBrief={overrides.initialBrief}
      onOpenExternal={onOpenExternal}
      onOpenInternal={onOpenInternal}
    />,
    { wrapper }
  );
  return { onOpenInternal, onOpenExternal, container: view.container };
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AnimeCard", () => {
  it("shows a loading status while the brief loads", () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(media());
    card();

    expect(screen.getByRole("status").textContent).toContain("Loading anime...");
  });

  it("renders the resolved card with meta and cover", async () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(media());
    const { onOpenInternal, onOpenExternal, container } = card();

    const title = await screen.findByRole("button", { name: "Open anime details" });
    expect(title.textContent).toContain("One Piece");
    expect(screen.getByText("TV · 1999 · 24 ep · ★ 87")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://s4.anilist.co/file/cover.jpg"
    );

    fireEvent.click(title);
    expect(onOpenInternal).toHaveBeenCalledWith(21);

    fireEvent.click(screen.getByRole("button", { name: "Open on AniList" }));
    expect(onOpenExternal).toHaveBeenCalledWith("https://anilist.co/anime/21");
  });

  it("uses the upfront brief without fetching", async () => {
    const fetch = vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(media());
    card({ initialBrief: media() });

    await screen.findByRole("button", { name: "Open anime details" });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves a primed brief without fetching", async () => {
    const fetch = vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(media());
    primeAnimeBrief(client, media());
    card();

    await screen.findByRole("button", { name: "Open anime details" });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("degrades to a site link when the resolve fails", async () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockRejectedValue(new Error("down"));
    card();

    const fallback = await screen.findByText("Open on AniList", undefined, {
      timeout: 5000,
    });

    expect(fallback.closest("a")?.getAttribute("href")).toBe(
      "https://anilist.co/anime/21"
    );
  });

  it("falls back to a letter tile without a cover", async () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(
      media({ cover_url: "" })
    );
    const { container } = card();

    await screen.findByRole("button", { name: "Open anime details" });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('span[aria-hidden="true"]')?.textContent).toBe(
      "O"
    );
  });

  it("renders no meta line without metadata", async () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(
      media({ format: null, season_year: null, episodes: null, score: null })
    );
    card();

    await screen.findByRole("button", { name: "Open anime details" });

    expect(screen.queryByText("TV · 1999 · 24 ep · ★ 87")).toBeNull();
  });

  it("defers to the account title language without an override", async () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(media());
    card({ preference: "account", seedAccount: accountUser() });

    const title = await screen.findByRole("button", { name: "Open anime details" });

    expect(title.textContent).toContain("ワンピース");
  });

  it("prefers the settings override over the account language", async () => {
    vi.spyOn(anilistApi, "fetchAnimeBrief").mockResolvedValue(media());
    card({ preference: "english", seedAccount: accountUser() });

    const title = await screen.findByRole("button", { name: "Open anime details" });

    expect(title.textContent).toContain("One Piece");
  });
});
