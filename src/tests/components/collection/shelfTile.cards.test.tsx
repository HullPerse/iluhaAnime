import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import ShelfTile from "@/routes/components/collection/shelfTile.cards";
import { makeShelfItem } from "@/tests/fixtures/cards/cards.fixture";

afterEach(cleanup);

it("keeps an indeterminate track until the exact total arrives", () => {
  const onOpen = vi.fn();
  const { rerender } = render(
    <ShelfTile item={makeShelfItem({ owned: 3, total: null })} onOpen={onOpen} />
  );
  const progress = screen.getByRole("progressbar");
  expect(progress.hasAttribute("aria-valuenow")).toBe(false);
  expect(progress.hasAttribute("aria-valuemax")).toBe(false);
  rerender(<ShelfTile item={makeShelfItem({ owned: 3, total: 82 })} onOpen={onOpen} />);
  expect(screen.getByRole("progressbar")).toBe(progress);
  expect(progress.getAttribute("aria-valuenow")).toBe("3");
  expect(progress.getAttribute("aria-valuemax")).toBe("82");
  expect(screen.getByText("4%")).toBeTruthy();
});
