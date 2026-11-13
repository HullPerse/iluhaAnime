import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
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
    if (command === "cards_stats") return Promise.resolve(makeCardsStats({ totalCards: 2 }));
    if (command === "cards_unread") return Promise.resolve({ packs: 0, cards: 0 });
    if (command === "cards_collection") return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
    return Promise.resolve(null);
  });
});

afterEach(() => {
  resetCardsStore();
  cleanup();
});

describe("collection shell", () => {
  it("shows the tabs and the wallet", async () => {
    renderWithCardsClient(<CollectionShell />);

    expect(await screen.findByRole("tab", { name: "Packs" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Album" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Shop" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gifts" })).toBeTruthy();
    const count = await screen.findByTestId("collection-card-count");
    expect(count.textContent).toBe("2");
    const wallet = await screen.findByTitle("Chubriks");
    expect(wallet.textContent).toContain("500");
  });

  it("shows unread badges on the packs and album tabs", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
      if (command === "cards_stats") return Promise.resolve(makeCardsStats({ totalCards: 2 }));
      if (command === "cards_unread") return Promise.resolve({ packs: 3, cards: 2 });
      if (command === "cards_collection")
        return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
      return Promise.resolve(null);
    });
    renderWithCardsClient(<CollectionShell />);

    const packsBadge = await screen.findByTestId("collection-unread-packs");
    expect(packsBadge.textContent).toBe("[3]");
    expect(screen.getByTestId("collection-unread-album").textContent).toBe("[2]");
  });

  it("switches to the album and renders its empty state", async () => {
    renderWithCardsClient(<CollectionShell />);
    await screen.findByRole("tab", { name: "Album" });

    fireEvent.click(screen.getByRole("tab", { name: "Album" }));

    expect(await screen.findByText("No cards in the album yet.")).toBeTruthy();
  });

  it("hides the test tools when the backend disables them", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap")
        return Promise.resolve(makeBootstrap({ testToolsEnabled: false }));
      if (command === "cards_collection")
        return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
      return Promise.resolve(null);
    });
    renderWithCardsClient(<CollectionShell />);

    fireEvent.click(await screen.findByRole("tab", { name: "Album" }));
    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("menuitem", { name: "Clear collection" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Test pack" })).toBeNull();
  });

  it("shows the bootstrap error and retries", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("database is busy"));
    renderWithCardsClient(<CollectionShell />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not load the collection.");

    mockInvoke.mockResolvedValue(makeBootstrap());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByTitle("Chubriks").textContent).toContain("500"));
  });
});
