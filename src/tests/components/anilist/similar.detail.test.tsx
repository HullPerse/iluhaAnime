import { mockConvertFileSrc, mockInvoke as invokeMock } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import { SimilarSection } from "@/routes/components/anilist/detail/similar.detail";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { AniRecommendation } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

function rec(id: number, title: string, rating = 90): AniRecommendation {
  return {
    id,
    title,
    cover_url: null,
    episodes: 24,
    score: 85,
    format: "TV",
    recommendation_rating: rating,
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

function mockFranchiseOnly() {
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anime_franchise") return Promise.resolve({ nodes: [] });
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en", anilistProxyUrl: null, similarView: "rail" });
  invokeMock.mockReset();
  resetTransportInflight();
});

describe("SimilarSection seeding", () => {
  it("renders seeded recommendations without fetching them", async () => {
    mockFranchiseOnly();
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

describe("SimilarSection rail", () => {
  beforeEach(mockFranchiseOnly);

  it("ranks recommendations and normalizes the strength bar", async () => {
    renderSection([rec(1, "Top Rec", 90), rec(2, "Second Rec", 45)]);

    await waitFor(() => expect(screen.getByText("Top Rec")).toBeDefined());
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
  });

  it("shows strength as a percent instead of the raw vote count", async () => {
    renderSection([rec(5, "Only Rec", 1203)]);

    await waitFor(() => expect(screen.getByText("Only Rec")).toBeDefined());
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.queryByText("1203%")).toBeNull();
  });
});

describe("SimilarSection view switch", () => {
  beforeEach(mockFranchiseOnly);

  it("switches from the rail to the list and back", async () => {
    renderSection([rec(1, "Top Rec", 90), rec(2, "Second Rec", 45)]);
    await waitFor(() => expect(screen.getByText("Top Rec")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Expand section" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Show as list" }));
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show as rail" })).toBeDefined();
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.getAllByText(/★ 85/)).toHaveLength(2);
    expect(settingsAtoms.similarView.get()).toBe("list");

    fireEvent.click(screen.getByRole("button", { name: "Show as rail" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show as rail" })).toBeNull();
    expect(settingsAtoms.similarView.get()).toBe("rail");
  });
});
