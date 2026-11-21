import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ShopCards from "@/routes/components/collection/shop.cards";
import { resetCardsStore } from "@/store/cards.store";

import { makeBootstrap, makeCardsStats, makePurchase } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

afterEach(() => {
  resetCardsStore();
  cleanup();
});

describe("collection shop", () => {
  it("shows pack sizes without repeated odds and disables unaffordable packs", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_shell")
        return Promise.resolve({
          bootstrap: makeBootstrap({ wallet: 90 }),
          stats: makeCardsStats(),
          unread: { packs: 0, cards: 0 },
          seen: { packsReadAt: 0, albumReadAt: 0 },
        });
      return Promise.resolve(null);
    });
    renderWithCardsClient(<ShopCards />);

    expect(await screen.findAllByText("7 карт")).toHaveLength(6);
    expect(screen.queryByText("Магазин паков")).toBeNull();
    expect(screen.queryByText(/Odds:/)).toBeNull();
    const short = screen.getAllByRole("button", { name: /Не хватает 10/ });
    expect(short).toHaveLength(6);
    expect((short[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("buys a themed pack without a success banner", async () => {
    mockInvoke.mockImplementation((command: unknown) => {
      if (command === "cards_shell")
        return Promise.resolve({
          bootstrap: makeBootstrap({ wallet: 200 }),
          stats: makeCardsStats(),
          unread: { packs: 0, cards: 0 },
          seen: { packsReadAt: 0, albumReadAt: 0 },
        });
      if (command === "cards_buy_pack") return Promise.resolve(makePurchase());
      return Promise.resolve(null);
    });
    renderWithCardsClient(<ShopCards />);

    const buy = await screen.findAllByRole("button", { name: "Купить" });
    fireEvent.click(buy[0] as HTMLButtonElement);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_buy_pack", { packKind: "default" })
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
