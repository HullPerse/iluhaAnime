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
  it("offers a gift even for a single copy and opens the flow on click", () => {
    const onOpen = vi.fn();
    renderWithCardsClient(<GiftAction onOpen={onOpen} />);

    const button = screen.getByRole("button", { name: "Создать подарок" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe("collection gift flow", () => {
  it("asks for confirmation before creating a gift", async () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    renderWithCardsClient(
      <GiftFlow item={makeCollectionItem()} onBack={onBack} onClose={onClose} />
    );

    expect(await screen.findByText(/Передать карточку/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Подарить" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_create_gift", {
        kind: "character",
        entityId: 45627,
      })
    );
    const input = (await screen.findByLabelText("Ссылка подарка")) as HTMLInputElement;
    const parsed = parseCardGiftLink(input.value);
    expect(parsed?.cards).toHaveLength(2);
    expect(parsed?.cards[0]?.copies).toBe(2);
    expect(parsed?.preview?.title).toBe("Card 1");

    fireEvent.click(screen.getByRole("button", { name: "Копировать" }));
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith(input.value));
    expect(await screen.findByRole("button", { name: "Ссылка скопирована." })).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    const closeButtons = screen.getAllByRole("button", { name: "Закрыть" });
    const footerClose = closeButtons.at(-1);

    if (footerClose === undefined) throw new Error("close button is missing");
    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
  });
});
