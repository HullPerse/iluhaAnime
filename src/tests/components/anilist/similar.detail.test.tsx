import { mockConvertFileSrc, mockInvoke as invokeMock } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import { SimilarSection } from "@/routes/components/anilist/detail/similar.detail";
import { patchSettings } from "@/store/settings.store";
import type { AniRecommendation } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

function rec(id: number, title: string): AniRecommendation {
  return {
    id,
    title,
    cover_url: null,
    episodes: 24,
    score: 85,
    format: "TV",
    recommendation_rating: 90,
  };
}

function renderSection(initialRecs?: AniRecommendation[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SimilarSection animeId={21} relations={[]} initialRecs={initialRecs} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en", anilistProxyUrl: null });
  invokeMock.mockReset();
  resetTransportInflight();
});

describe("SimilarSection seeding", () => {
  it("renders seeded recommendations without fetching them", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anime_franchise") return Promise.resolve({ nodes: [] });
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderSection([rec(7, "Seeded Rec")]);
    await waitFor(() => expect(screen.getByText("Seeded Rec")).toBeDefined());
    const recCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "get_anime_recommendations"
    );
    expect(recCalls).toHaveLength(0);
  });

  it("fetches recommendations when nothing is seeded", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anime_recommendations") return Promise.resolve([rec(9, "Fresh Rec")]);
      if (command === "get_anime_franchise") return Promise.resolve({ nodes: [] });
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderSection(undefined);
    await waitFor(() => expect(screen.getByText("Fresh Rec")).toBeDefined());
    expect(invokeMock).toHaveBeenCalledWith(
      "get_anime_recommendations",
      expect.objectContaining({ id: 21 })
    );
  });
});
