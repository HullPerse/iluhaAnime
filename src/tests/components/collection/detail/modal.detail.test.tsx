import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DetailCollection } from "@/routes/components/collection/detail/modal.detail";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ tmdbKeySet: true });
});

const ITEM = {
  id: "item-1",
  title: "Naruto",
  altTitles: [],
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
  externalIds: { tmdb: 1, anilist: null },
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

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DetailCollection
        item={ITEM}
        items={[ITEM]}
        statuses={[]}
        onClose={() => {}}
        onOpenItem={() => {}}
        onEdit={() => {}}
        refreshMetadata={() => Promise.resolve()}
      />
    </QueryClientProvider>
  );
}

describe("DetailCollection media view", () => {
  it("opens stills from the header icon button and returns on back", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      backdrops: [{ url: "https://image.tmdb.org/t/p/w780/a.jpg" }],
      trailerYoutubeId: null,
    });
    renderModal();
    const headerButton = await screen.findByRole("button", { name: /Кадры и трейлер|Stills and trailer/ });
    await user.click(headerButton);
    expect(await screen.findByText("1/1")).toBeDefined();
    expect(document.querySelector(".ui-titlebar")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /Назад|Back/ }));
    expect(
      await screen.findByRole("button", { name: /Кадры и трейлер|Stills and trailer/ })
    ).toBeDefined();
  });

  it("switches the header title with the selected tab", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      backdrops: [{ url: "https://image.tmdb.org/t/p/w780/a.jpg" }],
      trailerYoutubeId: "abc123",
    });
    renderModal();
    await user.click(
      await screen.findByRole("button", { name: /Кадры и трейлер|Stills and trailer/ })
    );
    const titlebar = document.querySelector(".ui-titlebar");
    await vi.waitFor(() => expect(titlebar?.textContent).toMatch(/Кадры|Stills/));
    await user.click(screen.getByRole("tab", { name: /Трейлер|Trailer/ }));
    await vi.waitFor(() => expect(titlebar?.textContent).toMatch(/Трейлер|Trailer/));
    await user.click(screen.getByRole("tab", { name: /Кадры|Stills/ }));
    await vi.waitFor(() => expect(titlebar?.textContent).toMatch(/Кадры|Stills/));
  });

  it("closes on Escape from the media view instead of the modal", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue({
      backdrops: [{ url: "https://image.tmdb.org/t/p/w780/a.jpg" }],
      trailerYoutubeId: null,
    });
    renderModal();
    await user.click(
      await screen.findByRole("button", { name: /Кадры и трейлер|Stills and trailer/ })
    );
    expect(await screen.findByText("1/1")).toBeDefined();
    await user.keyboard("{Escape}");
    expect(
      await screen.findByRole("button", { name: /Кадры и трейлер|Stills and trailer/ })
    ).toBeDefined();
  });
});
