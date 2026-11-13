import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import GiftsCards from "@/routes/components/collection/gifts.cards";
import type { GiftItem } from "@/types/api/cards";

import { makeOpenedCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

const [CARD] = makeOpenedCards(1);
if (CARD === undefined) throw new Error("card fixture is empty");

const GIFT: GiftItem = {
  id: "gift-1",
  createdAt: 1_760_000_000,
  claimedAt: null,
  card: CARD,
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_gifts") return Promise.resolve([GIFT]);
    if (command === "cards_delete_gift") return Promise.resolve({ returned: true });
    return Promise.resolve(null);
  });
});

describe("collection gifts tab", () => {
  it("lists the outbox and deletes an unclaimed gift", async () => {
    renderWithCardsClient(<GiftsCards />);

    expect(await screen.findAllByText("Card 1")).toHaveLength(2);
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_delete_gift", { giftId: "gift-1" })
    );
    expect(await screen.findByText("Gift deleted; its copy is back in the collection.")).toBeTruthy();
  });
});
