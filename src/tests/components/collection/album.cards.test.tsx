import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AlbumCards from "@/routes/components/collection/album.cards";
import {
  resetCardsStore,
  setCardsBinderPage,
  setCardsKind,
  setCardsRarity,
  setCardsSort,
} from "@/store/cards.store";

import { makeCollectionItem, makeCollectionPage } from "@/tests/fixtures/cards/cards.fixture";
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

function lastCollectionArgs(): Record<string, unknown> | undefined {
  const calls = mockInvoke.mock.calls.filter((call) => call[0] === "cards_collection");
  return calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

async function enableInfiniteScroll() {
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "Infinite scroll" }));
}

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown, args: unknown) => {
    if (command === "cards_gallery") {
      return Promise.resolve({ images: [], preferredUrl: null });
    }
    if (command === "cards_collection") {
      const request = args as { page?: number; pageSize?: number } | undefined;
      const page = request?.page ?? 1;
      const pageSize = request?.pageSize ?? 24;
      return Promise.resolve(
        makeCollectionPage({
          total: 48,
          page,
          pageSize,
          items: [
            makeCollectionItem({
              entityId: 45_627 + page - 1,
              title: page === 1 ? "Levi" : `Levi ${page}`,
              rarity: "common",
              variant: "normal",
            }),
          ],
        })
      );
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  resetCardsStore();
  cleanup();
});

describe("collection album", () => {
  it("applies the kind, rarity and sort filters on page one", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    act(() => {
      setCardsKind("anime");
      setCardsRarity("rare");
      setCardsSort("value");
    });

    await waitFor(() =>
      expect(lastCollectionArgs()).toMatchObject({
        kind: "anime",
        rarity: "rare",
        sort: "value",
        page: 1,
        pageSize: 36,
      })
    );
    expect(screen.getByText("Page 1")).toBeTruthy();
  });

  it("loads the next grid page without pagination", async () => {
    mockInvoke.mockImplementation((command: unknown, args: unknown) => {
      if (command !== "cards_collection") return Promise.resolve(null);
      const request = args as { page?: number; pageSize?: number };
      const page = request.page ?? 1;
      return Promise.resolve(
        makeCollectionPage({
          total: 96,
          page,
          pageSize: request.pageSize ?? 48,
          items: Array.from({ length: 48 }, (_, index) =>
            makeCollectionItem({
              entityId: page * 1000 + index,
              title: `Card ${page}-${index}`,
            })
          ),
        })
      );
    });

    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Card 1-0");
    await enableInfiniteScroll();

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith(
        "cards_collection",
        expect.objectContaining({ page: 2, pageSize: 48 })
      )
    );
    expect(await screen.findByText("Card 2-0")).toBeTruthy();
    expect(screen.queryByText("Page 1")).toBeNull();
  });

  it("returns the album to page-one pagination when the binder is selected", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    await enableInfiniteScroll();
    await waitFor(() => expect(lastCollectionArgs()).toMatchObject({ pageSize: 48 }));
    expect(screen.queryByText("Page 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Binder" }));

    expect(await screen.findByTestId("binder")).toBeTruthy();
    await waitFor(() => expect(lastCollectionArgs()).toMatchObject({ page: 1, pageSize: 12 }));
    expect(screen.getByText("Page 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Infinite scroll" })).toBeNull();
  });

  it("pages the binder through the pagination control state", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");
    fireEvent.click(screen.getByRole("button", { name: "Binder" }));
    await waitFor(() => expect(lastCollectionArgs()).toMatchObject({ pageSize: 12 }));

    act(() => setCardsBinderPage(1));

    await waitFor(() => expect(lastCollectionArgs()).toMatchObject({ page: 2 }));
    expect(await screen.findByText("Page 2")).toBeTruthy();
  });

  it("keeps the current page rendered while the next uncached page loads", async () => {
    let resolvePage: (value: ReturnType<typeof makeCollectionPage>) => void = () => {};
    mockInvoke.mockImplementation((command: unknown, args: unknown) => {
      if (command !== "cards_collection") return Promise.resolve(null);
      const page = (args as { page?: number } | undefined)?.page ?? 1;
      if (page === 2) {
        return new Promise((resolve) => {
          resolvePage = resolve as (value: ReturnType<typeof makeCollectionPage>) => void;
        });
      }
      return Promise.resolve(makeCollectionPage({ total: 48 }));
    });

    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");
    fireEvent.click(screen.getByRole("button", { name: "Binder" }));
    await waitFor(() => expect(lastCollectionArgs()).toMatchObject({ pageSize: 12 }));

    act(() => setCardsBinderPage(1));

    expect(screen.getByText("Levi")).toBeTruthy();

    await act(async () => resolvePage(makeCollectionPage({ total: 48, page: 2 })));
    expect(await screen.findByText("Page 2")).toBeTruthy();
  });

  it("switches to a twelve-pocket binder page", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    fireEvent.click(screen.getByRole("button", { name: "Binder" }));

    expect(await screen.findByTestId("binder")).toBeTruthy();
    await waitFor(() => expect(lastCollectionArgs()).toMatchObject({ pageSize: 12, page: 1 }));
  });

  it("switches the displayed variant when the same card is owned in several", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_gallery") {
        return Promise.resolve({ images: [], preferredUrl: null });
      }
      if (command === "cards_collection") {
        return Promise.resolve(
          makeCollectionPage({
            total: 1,
            pageSize: 36,
            items: [
              makeCollectionItem({
                entityId: 45_627,
                title: "Levi",
                rarity: "rare",
                variant: "normal",
                value: 10,
              }),
            ],
          })
        );
      }
      if (command === "cards_set_card_variant") return Promise.resolve(1);
      if (command === "cards_card_variants") {
        return Promise.resolve([
          makeCollectionItem({
            entityId: 45_627,
            title: "Levi",
            rarity: "rare",
            variant: "normal",
            value: 10,
          }),
          makeCollectionItem({
            entityId: 45_627,
            title: "Levi",
            rarity: "rare",
            variant: "foil",
            value: 30,
          }),
        ]);
      }
      return Promise.resolve(null);
    });

    renderWithCardsClient(<AlbumCards />);
    const user = userEvent.setup();
    fireEvent.click(await screen.findByRole("button", { name: /Levi/ }));
    await user.click(await screen.findByRole("combobox", { name: "Variant" }));
    await user.click(await screen.findByRole("option", { name: "Foil" }));

    const labels = Array.from(document.querySelectorAll("dt")).map((node) => node.textContent);
    expect(labels).toContain("Variant");
    expect(document.querySelector(".cards-detail-value span")?.textContent).toBe("30");
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_set_card_variant", {
        kind: "character",
        entityId: 45_627,
        variant: "foil",
      })
    );
  });

  it("clears the collection only after two confirmations", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear collection" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    const called = () =>
      mockInvoke.mock.calls.some(([command]) => command === "cards_reset_collection");
    expect(called()).toBe(false);

    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
    await waitFor(() => expect(called()).toBe(true));
  });

  it("previews another art and saves it only after Check", async () => {
    const images = [
      { url: "https://cdn/levi-1.jpg", thumbUrl: "https://cdn/levi-1-thumb.jpg" },
      { url: "https://cdn/levi-2.jpg", thumbUrl: "https://cdn/levi-2-thumb.jpg" },
    ];
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_gallery") {
        return Promise.resolve({ images, preferredUrl: null });
      }
      if (command === "cards_collection") {
        return Promise.resolve(
          makeCollectionPage({
            total: 1,
            pageSize: 36,
            items: [makeCollectionItem({ entityId: 45_627, title: "Levi" })],
          })
        );
      }
      if (command === "cards_set_preferred_image") return Promise.resolve(1);
      return Promise.resolve(null);
    });

    renderWithCardsClient(<AlbumCards />);
    fireEvent.click(await screen.findByRole("button", { name: /Levi/ }));
    expect(await screen.findByRole("button", { name: "Next art" })).toBeTruthy();
    expect(document.querySelector(".cards-detail-gallery-counter")?.textContent).toBe("1 / 2");

    fireEvent.click(screen.getByRole("button", { name: "Next art" }));
    expect(document.querySelector(".cards-detail-gallery-counter")?.textContent).toBe("2 / 2");
    fireEvent.click(screen.getByRole("button", { name: "Use this art" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_set_preferred_image", {
        kind: "character",
        entityId: 45_627,
        imageUrl: "https://cdn/levi-2.jpg",
      })
    );
  });

  it("shows the source anime and the obtained dates without a dust action", async () => {
    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    fireEvent.click(screen.getByRole("button", { name: /Levi/ }));
    expect(await screen.findByText("Shingeki no Kyojin")).toBeTruthy();
    const labels = Array.from(document.querySelectorAll("dt")).map((node) => node.textContent);
    expect(labels).toEqual(["Rarity", "Value", "Copies", "Obtained", "Latest"]);
    const facts = Array.from(document.querySelectorAll(".cards-detail-grid dd"));
    expect(facts[0]?.textContent).toBe("Common");
    expect(screen.queryByText("Normal")).toBeNull();
    const dates = document.querySelectorAll("time");
    expect(dates).toHaveLength(2);
    expect(dates[0]?.getAttribute("title")).not.toBe("");
    expect(dates[0]?.textContent).toMatch(/ago$/);

    expect(screen.queryByRole("button", { name: "Dust" })).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalledWith("cards_dust", expect.anything());
  });

  it("marks favorite cards in the album", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_gallery") {
        return Promise.resolve({ images: [], preferredUrl: null });
      }
      if (command === "cards_collection") {
        return Promise.resolve(
          makeCollectionPage({
            total: 1,
            items: [makeCollectionItem({ entityId: 45_627, title: "Levi", isFavorite: true })],
          })
        );
      }
      return Promise.resolve(null);
    });

    renderWithCardsClient(<AlbumCards />);
    await screen.findByText("Levi");

    expect(screen.getByTestId("card-favorite")).toBeTruthy();
  });
});
