import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AlbumCards from "@/routes/components/collection/album.cards";
import CollectionPageCards from "@/routes/components/collection/collectionPage.cards";
import CollectionShelf from "@/routes/components/collection/collectionShelf.cards";
import { resetCardsStore, setCardsAlbumMode } from "@/store/cards.store";

import {
  makeAnimeCollectionPage,
  makeCollectionPage,
  makeShelfItem,
} from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 280,
        size: 280,
      })),
    getTotalSize: () => count * 280,
    measure: () => {},
    measureElement: () => {},
  }),
}));

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_collections") {
      return Promise.resolve([
        makeShelfItem(),
        makeShelfItem({ animeId: 2, title: "Other anime", owned: 1 }),
      ]);
    }
    if (command === "cards_anime_collection") {
      return Promise.resolve(makeAnimeCollectionPage());
    }
    if (command === "cards_collection_roster") {
      return Promise.resolve({
        page: 2,
        total: 4,
        hasMore: false,
        available: true,
        characters: [
          { entityId: 45630, title: "Armin", imageUrl: null, favourites: 7, owned: false },
        ],
      });
    }
    if (command === "cards_collection") {
      return Promise.resolve(makeCollectionPage());
    }
    return Promise.resolve(null);
  });
});

afterEach(() => resetCardsStore());

describe("anime collections", () => {
  it("renders the shelf and opens the selected anime", async () => {
    const onOpen = vi.fn();
    renderWithCardsClient(<CollectionShelf sort="recent" sortDir="desc" onOpen={onOpen} />);

    const tiles = await screen.findAllByTestId("collection-shelf-tile");
    expect(tiles).toHaveLength(2);
    expect(screen.getByText("Shingeki no Kyojin")).toBeTruthy();
    expect(screen.getByText("2 of 8")).toBeTruthy();
    expect(screen.getByText("1 of 8")).toBeTruthy();
    fireEvent.click(tiles[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(16498, "anime");
  });

  it("renders owned cards first and unowned roster characters as silhouettes", async () => {
    renderWithCardsClient(
      <CollectionPageCards
        animeId={16498}
        collectionKind="anime"
        onBack={vi.fn()}
        onOpenCard={vi.fn()}
      />
    );

    expect(await screen.findAllByTestId("binder-pocket")).toHaveLength(11);
    const mainSlot = screen.getByTestId("collection-main");
    expect(within(mainSlot).getByText("Shingeki no Kyojin")).toBeTruthy();
    expect(within(mainSlot).queryByText("Levi")).toBeNull();
    expect(screen.getAllByTestId("collection-silhouette")).toHaveLength(2);
    expect(screen.getByText("Eren")).toBeTruthy();
    expect(screen.getByText("Mikasa")).toBeTruthy();
    expect(screen.getByTestId("collection-progress").textContent).toBe("Characters: 1 of 3");
  });

  it("requests the next roster page as soon as a collection opens", async () => {
    const roster = Array.from({ length: 25 }, (_, index) => ({
      entityId: 50_000 + index,
      title: `Character ${index}`,
      imageUrl: null,
      favourites: 0,
      owned: index === 0,
    }));
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_anime_collection") {
        return Promise.resolve(
          makeAnimeCollectionPage({
            roster,
            rosterPage: 1,
            rosterHasMore: true,
            rosterTotal: 100,
          })
        );
      }
      if (command === "cards_collection_roster") {
        return Promise.resolve({
          page: 2,
          total: 100,
          hasMore: true,
          available: true,
          characters: [
            { entityId: 60_000, title: "Eren", imageUrl: null, favourites: 9, owned: false },
          ],
        });
      }
      return Promise.resolve(null);
    });

    renderWithCardsClient(
      <CollectionPageCards
        animeId={16498}
        collectionKind="anime"
        onBack={vi.fn()}
        onOpenCard={vi.fn()}
      />
    );

    await screen.findByText("Levi");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_collection_roster", {
        mediaId: 16498,
        kind: "anime",
        page: 2,
      })
    );
  });

  it("loads the next roster page when the visible pages run out", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_anime_collection") {
        return Promise.resolve(
          makeAnimeCollectionPage({ rosterPage: 1, rosterHasMore: true, rosterTotal: 30 })
        );
      }
      if (command === "cards_collection_roster") {
        return Promise.resolve({
          page: 2,
          total: 30,
          hasMore: false,
          available: true,
          characters: [
            { entityId: 45630, title: "Armin", imageUrl: null, favourites: 7, owned: false },
          ],
        });
      }
      return Promise.resolve(null);
    });

    renderWithCardsClient(
      <CollectionPageCards
        animeId={16498}
        collectionKind="anime"
        onBack={vi.fn()}
        onOpenCard={vi.fn()}
      />
    );

    expect(await screen.findByText("Armin")).toBeTruthy();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_collection_roster", {
        mediaId: 16498,
        kind: "anime",
        page: 2,
      })
    );
    expect(screen.getAllByTestId("collection-silhouette")).toHaveLength(3);
  });

  it("opens the collections mode from the album", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    expect(screen.queryByRole("button", { name: "Staff" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Studios" })).toBeNull();
    act(() => setCardsAlbumMode("collections"));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_collections", {
        sort: "recent",
        sortDir: "desc",
      })
    );
    expect(await screen.findByTestId("collection-shelf")).toBeTruthy();
  });
});
