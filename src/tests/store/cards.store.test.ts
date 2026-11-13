import { beforeEach, describe, expect, it } from "vitest";

import {
  cardsAtoms,
  resetCardsStore,
  setCardsCollectionSort,
  setCardsCollectionSortDir,
  setCardsBinderPage,
  setCardsKind,
  setCardsRarity,
  setCardsPacksNewSince,
  setCardsRevealOpen,
  setCardsSort,
  setCardsSortDir,
  setCardsTab,
} from "@/store/cards.store";

beforeEach(() => {
  resetCardsStore();
});

describe("cards store", () => {
  it("starts on the packs tab with no filters", () => {
    expect(cardsAtoms.tab.get()).toBe("packs");
    expect(cardsAtoms.kind.get()).toBeNull();
    expect(cardsAtoms.rarity.get()).toBeNull();
    expect(cardsAtoms.sort.get()).toBe("recent");
    expect(cardsAtoms.sortDir.get()).toBe("desc");
    expect(cardsAtoms.collectionSort.get()).toBe("recent");
    expect(cardsAtoms.collectionSortDir.get()).toBe("desc");
    expect(cardsAtoms.binderPage.get()).toBe(0);
    expect(cardsAtoms.revealOpen.get()).toBe(false);
    expect(cardsAtoms.packsNewSince.get()).toBe(0);
    expect(cardsAtoms.albumNewSince.get()).toBe(0);
  });

  it("sets filters and returns the binder to the first page", () => {
    setCardsTab("album");
    setCardsBinderPage(4);
    setCardsKind("studio");
    setCardsBinderPage(3);
    setCardsRarity("legendary");
    setCardsBinderPage(2);
    setCardsSort("value");
    setCardsSortDir("asc");
    setCardsCollectionSort("completion");
    setCardsCollectionSortDir("asc");

    expect(cardsAtoms.tab.get()).toBe("album");
    expect(cardsAtoms.kind.get()).toBe("studio");
    expect(cardsAtoms.rarity.get()).toBe("legendary");
    expect(cardsAtoms.sort.get()).toBe("value");
    expect(cardsAtoms.sortDir.get()).toBe("asc");
    expect(cardsAtoms.collectionSort.get()).toBe("completion");
    expect(cardsAtoms.collectionSortDir.get()).toBe("asc");
    expect(cardsAtoms.binderPage.get()).toBe(0);
  });

  it("never stores a negative binder page and resets every field", () => {
    setCardsBinderPage(-2);
    expect(cardsAtoms.binderPage.get()).toBe(0);

    setCardsTab("shop");
    setCardsKind("anime");
    setCardsRarity("epic");
    setCardsSort("rarity");
    setCardsBinderPage(5);
    setCardsRevealOpen(true);
    setCardsPacksNewSince(42);

    resetCardsStore();

    expect(cardsAtoms.tab.get()).toBe("packs");
    expect(cardsAtoms.kind.get()).toBeNull();
    expect(cardsAtoms.rarity.get()).toBeNull();
    expect(cardsAtoms.sort.get()).toBe("recent");
    expect(cardsAtoms.sortDir.get()).toBe("desc");
    expect(cardsAtoms.collectionSort.get()).toBe("recent");
    expect(cardsAtoms.collectionSortDir.get()).toBe("desc");
    expect(cardsAtoms.binderPage.get()).toBe(0);
    expect(cardsAtoms.revealOpen.get()).toBe(false);
    expect(cardsAtoms.packsNewSince.get()).toBe(0);
  });

  it("keeps card and collection sorting independent and stores both", () => {
    setCardsSort("value");
    setCardsCollectionSort("completion");
    setCardsCollectionSortDir("asc");

    expect(cardsAtoms.sort.get()).toBe("value");
    expect(cardsAtoms.collectionSort.get()).toBe("completion");
    expect(cardsAtoms.collectionSortDir.get()).toBe("asc");
    expect(JSON.parse(localStorage.getItem("iluha.v1.cards-sort") ?? "{}")).toMatchObject({
      sort: "value",
      collectionSort: "completion",
      collectionSortDir: "asc",
    });
  });

  it("resets the direction to the natural one when the sort key changes", () => {
    setCardsSortDir("asc");
    setCardsSort("title");
    expect(cardsAtoms.sortDir.get()).toBe("asc");
    setCardsSortDir("desc");
    setCardsSort("recent");
    expect(cardsAtoms.sortDir.get()).toBe("desc");
  });
});
