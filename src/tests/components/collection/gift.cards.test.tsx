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
  value: 12,
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_claim_gift") return Promise.resolve(makeOpenedCards(1)[0]);
    return Promise.resolve(null);
  });
});

describe("collection gift dialog", () => {
  it("claims the full payload and shows a receipt link", async () => {
    const onClose = vi.fn();
    renderWithCardsClient(<GiftDialog gift={GIFT} onClose={onClose} />);

    expect(await screen.findByText(/local gift/i)).toBeTruthy();
    expect(screen.getByText("Rare")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Claim" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_claim_gift", {
        giftId: GIFT.giftId,
        kind: GIFT.kind,
        entityId: GIFT.entityId,
        rarity: GIFT.rarity,
        variant: GIFT.variant,
        value: GIFT.value,
      })
    );
    expect(await screen.findByText("Gift claimed.")).toBeTruthy();
    expect(screen.getAllByText("Card 1")).toHaveLength(2);
    expect(screen.getByDisplayValue("iluhaanime://card/gift/receipt/gift-123-456")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
