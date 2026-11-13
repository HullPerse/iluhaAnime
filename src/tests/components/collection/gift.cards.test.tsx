import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GiftDialog from "@/routes/components/collection/giftDialog.cards";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

import { makeOpenedCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

const GIFT: CardGiftDeepLink = {
  giftId: "gift-123-456",
  kind: "character",
  entityId: 45627,
  rarity: "rare",
  variant: "foil",
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_claim_gift") return Promise.resolve(makeOpenedCards(1)[0]);
    return Promise.resolve(null);
  });
});

describe("collection gift dialog", () => {
  it("explains the local gift and claims it with the opaque id", async () => {
    const onClose = vi.fn();
    renderWithCardsClient(<GiftDialog gift={GIFT} onClose={onClose} />);

    expect(await screen.findByText(/local gift/i)).toBeTruthy();
    expect(screen.getByText("Rare")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Claim" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_claim_gift", { giftId: GIFT.giftId })
    );
    expect(await screen.findByText("Gift claimed.")).toBeTruthy();
    expect(screen.getAllByText("Card 1")).toHaveLength(2);
    expect(onClose).not.toHaveBeenCalled();
  });
});
