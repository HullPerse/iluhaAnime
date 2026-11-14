import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CollectionShell from "@/routes/components/collection/shell.cards";
import { resetCardsStore } from "@/store/cards.store";

import {
  makeBootstrap,
  makeCardsStats,
  makeCollectionPage,
} from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
    if (command === "cards_starter_status")
      return Promise.resolve({
        connected: false,
        userId: 0,
        completed: 0,
        granted: false,
        packs: 0,
      });
    if (command === "cards_stats") return Promise.resolve(makeCardsStats());
    if (command === "cards_packs") return Promise.resolve([]);
    if (command === "cards_collection")
      return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
    return Promise.resolve(null);
  });
});

afterEach(() => {
  resetCardsStore();
  cleanup();
});

describe("collection packs", () => {
  it("keeps the test pack grants out of the album menu", async () => {
    renderWithCardsClient(<CollectionShell />);

    fireEvent.click(await screen.findByRole("tab", { name: "Album" }));
    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("menuitem", { name: "Clear collection" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Test pack" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Legendary pack" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Effects pack" })).toBeNull();
  });
});
