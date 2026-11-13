import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GiftDialog from "@/routes/components/collection/giftDialog.cards";
import type { CardGiftDeepLink } from "@/types/core/deeplink";

import { makeGiftCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

const GIFT: CardGiftDeepLink = {
  giftId: "gift-123-456",
  kind: "character",
  entityId: 45627,
  preview: {
    title: "Preview card",
    imageUrl: null,
    collage: [],
    collectionTitle: "Shingeki no Kyojin",
  },
  cards: makeGiftCards(2).map((card) => ({
    rarity: card.rarity,
    variant: card.variant,
    copies: card.copies,
    value: card.value,
    firstObtainedAt: card.firstObtainedAt,
    lastObtainedAt: card.lastObtainedAt,
  })),
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_claim_gift") return Promise.resolve(makeGiftCards(2));
    return Promise.resolve(null);
  });
});

describe("collection gift dialog", () => {
  it("claims the full payload and shows a receipt link", async () => {
    const onClose = vi.fn();
    renderWithCardsClient(<GiftDialog gift={GIFT} onClose={onClose} />);

    expect(await screen.findByRole("heading", { name: "Preview card" })).toBeTruthy();
    expect(screen.getAllByText(/Rare/).length).toBeGreaterThan(0);
    expect(document.querySelector(".cards-gift-detail [data-kind]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Claim" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_claim_gift", {
        giftId: GIFT.giftId,
        kind: GIFT.kind,
        entityId: GIFT.entityId,
        cards: GIFT.cards,
      })
    );
    expect(await screen.findByText("Gift claimed.")).toBeTruthy();
    expect(screen.getAllByText("Card 1")).toHaveLength(2);
    expect(document.querySelector(".cards-gift-detail [data-kind]")).not.toBeNull();
    expect(screen.getByDisplayValue("iluhaanime://card/gift/receipt/gift-123-456")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
