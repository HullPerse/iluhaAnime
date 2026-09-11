import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SimilarSection } from "@/routes/components/anilist/detail/similar.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { AniRecommendation, AniRelation, FranchiseGraph } from "@/types/anilist";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ language: "en", tmdbKeySet: false });
});

function rec(id: number): AniRecommendation {
  return {
    id,
    title: `Rec ${id}`,
    cover_url: null,
    episodes: 12,
    score: 80,
    format: "TV",
    recommendation_rating: id,
  };
}

function relation(id: number): AniRelation {
  return {
    relation_type: "SEQUEL",
    media: {
      id,
      title: `Rel ${id}`,
      cover_url: null,
      episodes: 12,
      score: 80,
      format: "TV",
      media_type: "ANIME",
    },
  };
}

function franchiseGraph(nodeIds: number[]): FranchiseGraph {
  return {
    root_id: 1,
    nodes: nodeIds.map((id) => ({
      id,
      title: `Node ${id}`,
      cover_url: null,
      episodes: 12,
      score: 80,
      format: "TV",
      media_type: "ANIME",
      year: 2020,
    })),
    edges: [],
  };
}

function mockResponses(recs: AniRecommendation[], nodeIds: number[]) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "get_anime_recommendations") return Promise.resolve(recs);
    if (cmd === "get_anime_franchise") return Promise.resolve(franchiseGraph(nodeIds));
    return Promise.resolve(null);
  });
}

function renderSection(relations: AniRelation[] = []) {
  const onRelated = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SimilarSection animeId={1} relations={relations} onRelated={onRelated} />
    </QueryClientProvider>
  );
  return { ...view, onRelated };
}

function sectionEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector('section[aria-label="Similar"]');
}

async function expandSection(container: HTMLElement) {
  const toggle = sectionEl(container)?.querySelector("header button");
  expect(toggle).not.toBeNull();
  await userEvent.setup().click(toggle as HTMLButtonElement);
}

describe("SimilarSection", () => {
  it("shows the top 8 recommendations excluding self, relations and franchise nodes", async () => {
    const recs = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(rec);
    mockResponses(recs, [1, 11]);
    const { container } = renderSection([relation(13), relation(12)]);
    await vi.waitFor(() => expect(sectionEl(container)).not.toBeNull());
    expect(sectionEl(container)?.querySelector("header")?.textContent).toBe("Similar [8]");
    await expandSection(container);
    for (const id of [10, 9, 8, 7, 6, 5, 4, 3]) {
      expect(screen.getByRole("button", { name: `Rec ${id}` })).toBeDefined();
    }
    expect(screen.queryByRole("button", { name: "Rec 2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rec 11" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rec 12" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rec 13" })).toBeNull();
  });

  it("navigates to the clicked recommendation by mouse and keyboard", async () => {
    mockResponses([4, 5].map(rec), [1]);
    const { container, onRelated } = renderSection();
    await vi.waitFor(() => expect(sectionEl(container)).not.toBeNull());
    await expandSection(container);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rec 5" }));
    expect(onRelated).toHaveBeenCalledWith(5);
    const card = screen.getByRole("button", { name: "Rec 4" });
    card.focus();
    await user.keyboard("{Enter}");
    expect(onRelated).toHaveBeenCalledWith(4);
  });

  it("hides the section when recommendations are empty", async () => {
    mockResponses([], [1]);
    const { container } = renderSection();
    await vi.waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "get_anime_recommendations",
        expect.anything()
      )
    );
    await vi.waitFor(() => expect(sectionEl(container)).toBeNull());
  });

  it("hides the section when recommendations fail", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_recommendations") return Promise.reject(new Error("offline"));
      if (cmd === "get_anime_franchise") return Promise.resolve(franchiseGraph([1]));
      return Promise.resolve(null);
    });
    const { container } = renderSection();
    await vi.waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "get_anime_recommendations",
        expect.anything()
      )
    );
    await vi.waitFor(() => expect(sectionEl(container)).toBeNull());
  });

  it("falls back to relations-only exclusion when franchise fails", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_anime_recommendations")
        return Promise.resolve([2, 3, 4, 5].map(rec));
      if (cmd === "get_anime_franchise") return Promise.reject(new Error("offline"));
      return Promise.resolve(null);
    });
    const { container } = renderSection([relation(5)]);
    await vi.waitFor(() => expect(sectionEl(container)).not.toBeNull(), { timeout: 5000 });
    await expandSection(container);
    expect(screen.getByRole("button", { name: "Rec 4" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Rec 5" })).toBeNull();
  });
});
