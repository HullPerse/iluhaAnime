import { mockConvertFileSrc, mockInvoke as invokeMock } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
import { patchSettings } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function renderModal() {
  return render(
    <AniListDetailModal
      animeId={21}
      isLoggedIn={false}
      onTag={() => undefined}
      onGenre={() => undefined}
      onClose={() => undefined}
    />,
    { wrapper }
  );
}

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
        media: {
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
        },
        characters: [],
        staff: [],
        recommendations: [],
      });
    }
    if (command === "get_anime_franchise") {
      return Promise.resolve({ root_id: 21, nodes: [], edges: [] });
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
