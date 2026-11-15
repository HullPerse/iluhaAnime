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

const NO_STARTER = {
  connected: false,
  userId: 0,
  completed: 0,
  granted: false,
  packs: 0,
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
    if (command === "cards_starter_status") return Promise.resolve(NO_STARTER);
    if (command === "cards_stats") return Promise.resolve(makeCardsStats({ totalCards: 2 }));
    if (command === "cards_unread") return Promise.resolve({ packs: 0, cards: 0 });
    if (command === "cards_collection")
      return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
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

    expect(await screen.findByRole("tab", { name: "Паки" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Альбом" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Магазин" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Подарки" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "iluhaGuesser" })).toBeTruthy();
    expect(screen.getByTestId("daily-reset-timer")).toBeTruthy();
    const count = await screen.findByTestId("collection-card-count");
    expect(count.textContent).toBe("2");
    const wallet = await screen.findByTitle("Чубрики");
    expect(wallet.textContent).toContain("500");
  });

  it("shows the active gift count next to the gifts tab", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
      if (command === "cards_starter_status") return Promise.resolve(NO_STARTER);
      if (command === "cards_stats")
        return Promise.resolve(makeCardsStats({ totalCards: 2, activeGifts: 2 }));
      if (command === "cards_unread") return Promise.resolve({ packs: 0, cards: 0 });
      if (command === "cards_collection")
        return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
      return Promise.resolve(null);
    });
    renderWithCardsClient(<CollectionShell />);

    const badge = await screen.findByTestId("collection-active-gifts");
    expect(badge.textContent).toBe("2");
    expect(badge.title).toBe("Действующих подарков: 2");
  });

  it("shows unread badges on the packs and album tabs", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
      if (command === "cards_starter_status") return Promise.resolve(NO_STARTER);
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
    await screen.findByRole("tab", { name: "Альбом" });

    fireEvent.click(screen.getByRole("tab", { name: "Альбом" }));

    expect(await screen.findByText("В альбоме пока нет карточек.")).toBeTruthy();
  });

  it("keeps the removed pack and daily test buttons out of the UI", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap")
        return Promise.resolve(makeBootstrap({ testToolsEnabled: true }));
      if (command === "cards_starter_status") return Promise.resolve(NO_STARTER);
      if (command === "cards_collection")
        return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
      return Promise.resolve(null);
    });
    renderWithCardsClient(<CollectionShell />);

    fireEvent.click(await screen.findByRole("tab", { name: "Альбом" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ещё действия" }));
    expect(await screen.findByRole("menuitem", { name: "Очистить коллекцию" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Test pack" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Legendary pack" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Effects pack" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset daily" })).toBeNull();
  });

  it("shows the bootstrap error and retries", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("database is busy"));
    renderWithCardsClient(<CollectionShell />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Не удалось загрузить коллекцию.");

    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
      if (command === "cards_starter_status") return Promise.resolve(NO_STARTER);
      return Promise.resolve(null);
    });
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(screen.getByTitle("Чубрики").textContent).toContain("500"));
  });

  it("hides the starter claim when the profile has no completed anime", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
      if (command === "cards_starter_status")
        return Promise.resolve({
          connected: true,
          userId: 7,
          completed: 0,
          granted: false,
          packs: 0,
        });
      if (command === "cards_stats") return Promise.resolve(makeCardsStats());
      if (command === "cards_collection")
        return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
      return Promise.resolve(null);
    });
    renderWithCardsClient(<CollectionShell />);

    await screen.findByRole("tab", { name: "Паки" });
    expect(screen.queryByRole("button", { name: "Забрать паки" })).toBeNull();
  });

  it("claims the profile starter once and hides the button", async () => {
    let claimed = false;
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_bootstrap")
        return Promise.resolve(makeBootstrap({ starterGranted: claimed }));
      if (command === "cards_starter_status")
        return Promise.resolve({
          connected: true,
          userId: 7,
          completed: 12,
          granted: claimed,
          packs: claimed ? 3 : 0,
        });
      if (command === "cards_grant_starter") {
        claimed = true;
        return Promise.resolve({ granted: true, packs: 3 });
      }
      if (command === "cards_stats") return Promise.resolve(makeCardsStats());
      if (command === "cards_unread") return Promise.resolve({ packs: 0, cards: 0 });
      if (command === "cards_collection")
        return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
      return Promise.resolve(null);
    });
    renderWithCardsClient(<CollectionShell />);

    const button = await screen.findByRole("button", { name: "Забрать паки" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.queryByRole("button", { name: "Забрать паки" })).toBeNull());
    expect(mockInvoke).toHaveBeenCalledWith(
      "cards_grant_starter",
      expect.objectContaining({ userId: 7 })
    );
  });
});
