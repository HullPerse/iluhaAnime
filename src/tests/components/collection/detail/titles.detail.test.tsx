import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailCollection } from "@/routes/components/collection/detail/modal.detail";
import { TitlesCollection } from "@/routes/components/collection/detail/titles.detail";
import { useSearchStore } from "@/store/search.store";
import type { CollectionItem } from "@/types/collection";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
  useSearchStore.setState({ crossSearchQuery: null });
});

const MODAL_ITEM = {
  id: "item-9",
  title: "Sousou no Frieren",
  altTitles: ["Frieren: Beyond Journey's End"],
  type: "tv",
  status: "watching",
  progressValue: 0,
  progressTotal: null,
  progressUnit: "episodes",
  durationMinutes: null,
  rating: null,
  priority: "normal",
  isFavorite: false,
  year: null,
  genres: [],
  studio: null,
  description: null,
  notes: null,
  coverUrl: null,
  coverBlobId: null,
  thumbBlobId: null,
  externalIds: { tmdb: null, anilist: null },
  customFields: {},
  localPath: null,
  localKind: null,
  startedAt: null,
  finishedAt: null,
  lastWatchedAt: null,
  rewatchCount: 0,
  addedAt: 0,
  updatedAt: 0,
  sitesToView: [],
  tvCurrentSeason: null,
  tvCurrentEpisode: null,
  detailsJson: null,
} as unknown as CollectionItem;

describe("TitlesCollection", () => {
  it("searches torrents by the clicked title and closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TitlesCollection
        title="Sousou no Frieren"
        altTitles={["Frieren: Beyond Journey's End", "葬送のフリーレン"]}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole("button", { name: "Frieren: Beyond Journey's End" }));
    expect(useSearchStore.getState().crossSearchQuery).toBe("Frieren: Beyond Journey's End");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lists the main title first and searches by it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TitlesCollection title="Sousou no Frieren" altTitles={["Sousou"]} onClose={onClose} />);
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim() ?? "");
    expect(names).toEqual(["Sousou no Frieren", "Sousou"]);
    await user.click(screen.getByRole("button", { name: "Sousou no Frieren" }));
    expect(useSearchStore.getState().crossSearchQuery).toBe("Sousou no Frieren");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops blank and repeated titles", () => {
    render(
      <TitlesCollection
        title="Frieren"
        altTitles={["Frieren", "  ", "", "frieren", "Sousou no Frieren", "Sousou no Frieren"]}
        onClose={() => {}}
      />
    );
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim() ?? "");
    expect(names).toEqual(["Frieren", "Sousou no Frieren"]);
  });

  it("renders nothing without any title", () => {
    const { container } = render(
      <TitlesCollection title="  " altTitles={[]} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("searches from the collection modal and closes it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DetailCollection
          item={MODAL_ITEM}
          items={[MODAL_ITEM]}
          statuses={[]}
          onClose={onClose}
          onOpenItem={() => {}}
          onEdit={() => {}}
          refreshMetadata={() => Promise.resolve()}
        />
      </QueryClientProvider>
    );
    await user.click(screen.getByRole("button", { name: "Frieren: Beyond Journey's End" }));
    expect(useSearchStore.getState().crossSearchQuery).toBe("Frieren: Beyond Journey's End");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
