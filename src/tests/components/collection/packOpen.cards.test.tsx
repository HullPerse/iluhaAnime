import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import PackOpen from "@/routes/components/collection/packOpen.cards";
import { makeOpenedCards } from "@/tests/fixtures/cards/cards.fixture";

afterEach(cleanup);

it("submits one choice per attempt and permits another choice after an error", async () => {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const cards = makeOpenedCards(2);
  const pack = (choiceError = false) => (
    <PackOpen cards={cards} choiceError={choiceError} onChoose={onChoose} onClose={onClose} />
  );
  const { rerender } = render(pack());
  const firstCard = await screen.findByTestId("card-flip-0");
  const secondCard = screen.getByTestId("card-flip-1");

  act(() => {
    firstCard.click();
    secondCard.click();
  });
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(0);

  rerender(pack(true));
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(secondCard);
  expect(onChoose.mock.calls).toEqual([[0], [1]]);
});
