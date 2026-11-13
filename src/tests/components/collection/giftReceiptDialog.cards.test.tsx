import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import GiftReceiptDialog from "@/routes/components/collection/giftReceiptDialog.cards";
import type { GiftItem } from "@/types/api/cards";

import { makeGiftCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

const CARDS = makeGiftCards(1);

const GIFT: GiftItem = {
  id: "gift-1",
  createdAt: 1_760_000_000,
  claimedAt: 1_760_000_100,
  cards: CARDS,
  totalCopies: 2,
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_gifts") return Promise.resolve([{ ...GIFT, claimedAt: null }]);
    if (command === "cards_mark_gift_claimed") return Promise.resolve(GIFT);
    return Promise.resolve(null);
  });
});

describe("collection gift receipt", () => {
  it("confirms the receipt and settles the outbox row", async () => {
    renderWithCardsClient(
      <GiftReceiptDialog receipt={{ giftId: GIFT.id }} onClose={() => undefined} />
    );

    expect(await screen.findByRole("heading", { name: "Card 1" })).toBeTruthy();
    expect(screen.getByText("Gift contents")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_mark_gift_claimed", { giftId: GIFT.id })
    );
    expect(await screen.findByText("Gift receipt confirmed.")).toBeTruthy();
    expect(screen.getByText("Gift removed from the list.")).toBeTruthy();
  });
});
