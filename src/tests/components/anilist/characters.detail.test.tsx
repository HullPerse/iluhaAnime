import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import AniListCharactersPanel from "@/routes/components/anilist/detail/characters.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniCharacterEdge } from "@/types/anilist";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
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

function renderPanel(initialEdges?: AniCharacterEdge[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AniListCharactersPanel animeId={21} initialEdges={initialEdges} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useSettingsStore.setState({ language: "en", anilistProxyUrl: null });
  invokeMock.mockReset();
  resetTransportInflight();
});

describe("AniListCharactersPanel seeding", () => {
  it("renders seeded page one without fetching it", async () => {
    const seeded = Array.from({ length: 25 }, (_, i) => edge(1000 + i, `Seeded ${i}`));
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anime_characters") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel(seeded);
    await waitFor(() => expect(screen.getByText("Seeded 0")).toBeDefined());
    const characterCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "get_anime_characters"
    );
    expect(characterCalls).toHaveLength(0);
  });

  it("fetches page two from the show-more button after a full seeded page", async () => {
    const seeded = Array.from({ length: 25 }, (_, i) => edge(1000 + i, `Seeded ${i}`));
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anime_characters") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel(seeded);
    fireEvent.click(await screen.findByRole("button", { name: "Expand section" }));
    const more = await screen.findByRole("button", { name: "Show more" });
    fireEvent.click(more);
    await waitFor(() =>
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "get_anime_characters")
      ).toHaveLength(1)
    );
    const [, args] = invokeMock.mock.calls.find(
      ([command]) => command === "get_anime_characters"
    ) as [string, { page: number }];
    expect(args.page).toBe(2);
  });

  it("fetches page one when nothing is seeded", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anime_characters") return Promise.resolve([edge(7, "Hero")]);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel(undefined);
    await waitFor(() => expect(screen.getByText("Hero")).toBeDefined());
    expect(invokeMock).toHaveBeenCalledWith(
      "get_anime_characters",
      expect.objectContaining({ page: 1 })
    );
  });
});
