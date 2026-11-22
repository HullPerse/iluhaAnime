import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import GiftsCards from "@/routes/components/collection/gifts.cards";
import type { GiftItem } from "@/types/api/cards";

import { makeGiftCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

const GIFT: GiftItem = {
  id: "gift-1",
  createdAt: 1_760_000_000,
  claimedAt: null,
  cards: makeGiftCards(1),
  totalCopies: 2,
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_gifts") return Promise.resolve([GIFT]);

    if (command === "cards_delete_gift") return Promise.resolve({ returned: true });

    return Promise.resolve(null);
  });
});

describe("collection gifts tab", () => {
  it("lists gifts and deletes an unclaimed gift", async () => {
    renderWithCardsClient(<GiftsCards />);

    expect(await screen.findAllByText("Card 1")).toHaveLength(1);
    expect(screen.queryByText("Outgoing gifts")).toBeNull();
    expect(screen.queryByText("Waiting")).toBeNull();
    expect(screen.getByText("×2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Копировать" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_delete_gift", { giftId: "gift-1" })
    );
    expect(
      await screen.findByText("Подарок удалён, все варианты и копии возвращены в коллекцию.")
    ).toBeTruthy();
  });
});
