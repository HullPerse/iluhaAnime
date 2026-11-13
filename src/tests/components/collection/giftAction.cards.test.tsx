import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GiftAction from "@/routes/components/collection/giftAction.cards";
import GiftFlow from "@/routes/components/collection/giftFlow.cards";

import {
  makeCollectionItem,
  makeOpenedCards,
} from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_create_gift") {
      return Promise.resolve({ id: "gift-new", card: makeOpenedCards(1)[0] });
    }
    return Promise.resolve(null);
  });
});

describe("collection gift action", () => {
  it("opens the gift flow from the header button", () => {
    const onOpen = vi.fn();
    renderWithCardsClient(<GiftAction item={makeCollectionItem()} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Create gift" }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("does not offer a gift for the last copy", () => {
    renderWithCardsClient(
      <GiftAction item={makeCollectionItem({ copies: 1 })} onOpen={() => undefined} />
    );

    expect(
      (screen.getByRole("button", { name: "Create gift" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe("collection gift flow", () => {
  it("asks for confirmation before creating a gift", async () => {
    const onBack = vi.fn();
    renderWithCardsClient(
      <GiftFlow item={makeCollectionItem()} onBack={onBack} onClose={() => undefined} />
    );

    expect(await screen.findByText(/Gift one copy of/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Gift" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_create_gift", {
        kind: "character",
        entityId: 45627,
        rarity: "rare",
        variant: "foil",
      })
    );
    expect(
      await screen.findByDisplayValue(
        "iluhaanime://card/gift/gift-new/character/100/rare/normal/2"
      )
    ).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });
});
