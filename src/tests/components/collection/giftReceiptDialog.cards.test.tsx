import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import GiftReceiptDialog from "@/routes/components/collection/giftReceiptDialog.cards";
import type { GiftItem } from "@/types/api/cards";

import { makeOpenedCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

const [CARD] = makeOpenedCards(1);
if (CARD === undefined) throw new Error("card fixture is empty");

const GIFT: GiftItem = {
  id: "gift-1",
  createdAt: 1_760_000_000,
  claimedAt: 1_760_000_100,
  card: CARD,
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_mark_gift_claimed") return Promise.resolve(GIFT);
    return Promise.resolve(null);
  });
});

describe("collection gift receipt", () => {
  it("confirms the receipt and settles the outbox row", async () => {
    renderWithCardsClient(
      <GiftReceiptDialog receipt={{ giftId: GIFT.id }} onClose={() => undefined} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_mark_gift_claimed", { giftId: GIFT.id })
    );
    expect(await screen.findByText("Gift receipt confirmed.")).toBeTruthy();
  });
});
