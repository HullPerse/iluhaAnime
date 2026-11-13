import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GiftAction from "@/routes/components/collection/giftAction.cards";
import GiftFlow from "@/routes/components/collection/giftFlow.cards";

import { parseCardGiftLink } from "@/lib/cards/gift.utils";
import { makeCollectionItem, makeGiftCards } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke, mockWriteText } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_create_gift") {
      return Promise.resolve({ id: "gift-new", cards: makeGiftCards(2) });
    }
    return Promise.resolve(null);
  });
});

describe("collection gift action", () => {
  it("opens the gift flow from the header button", () => {
    const onOpen = vi.fn();
    renderWithCardsClient(<GiftAction onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Create gift" }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("offers a gift even for a single copy", () => {
    renderWithCardsClient(<GiftAction onOpen={() => undefined} />);

    expect(
      (screen.getByRole("button", { name: "Create gift" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});

describe("collection gift flow", () => {
  it("asks for confirmation before creating a gift", async () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    renderWithCardsClient(
      <GiftFlow item={makeCollectionItem()} onBack={onBack} onClose={onClose} />
    );

    expect(await screen.findByText(/Gift all of/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Gift" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_create_gift", {
        kind: "character",
        entityId: 45627,
      })
    );
    const input = (await screen.findByLabelText("Gift link")) as HTMLInputElement;
    const parsed = parseCardGiftLink(input.value);
    expect(parsed?.cards).toHaveLength(2);
    expect(parsed?.cards[0]?.copies).toBe(2);
    expect(parsed?.preview?.title).toBe("Card 1");

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith(input.value));
    expect(await screen.findByRole("button", { name: "Link copied." })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    const footerClose = closeButtons.at(-1);
    if (footerClose === undefined) throw new Error("close button is missing");
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
  });
});
