import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BinderCards from "@/routes/components/collection/binder.cards";
import type { CollectionItem } from "@/types/api/cards";

import { makeCollectionItem } from "@/tests/fixtures/cards/cards.fixture";

function cards(count: number): CollectionItem[] {
  return Array.from({ length: count }, (_, index) =>
    makeCollectionItem({
      entityId: 1000 + index,
      title: `Card ${index + 1}`,
      copies: 1,
    })
  );
}

afterEach(cleanup);

describe("collection binder", () => {
  it("renders twelve pockets and pads a short page with empty slots", () => {
    render(<BinderCards items={cards(1)} page={0} pageCount={1} columns={4} pageSize={12} />);

    expect(screen.getByTestId("binder")).toBeTruthy();
    expect(screen.getAllByTestId("binder-pocket")).toHaveLength(12);
    expect(screen.getAllByTestId("binder-pocket")[1]?.dataset.empty).toBe("true");
  });

  it("opens a card from its pocket", () => {
    const onOpen = vi.fn();
    render(
      <BinderCards
        items={cards(12)}
        page={0}
        pageCount={1}
        columns={4}
        pageSize={12}
        onOpen={onOpen}
      />
    );

    fireEvent.click(screen.getAllByTestId("binder-pocket")[0] as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: "Card 1" }));
  });

  it("marks the remaining pockets empty", () => {
    render(
      <BinderCards items={cards(13).slice(12)} page={1} pageCount={2} columns={4} pageSize={12} />
    );

    const pockets = screen.getAllByTestId("binder-pocket");
    expect(pockets).toHaveLength(12);
    expect(pockets[0]?.dataset.empty).toBeUndefined();
    expect(pockets[1]?.dataset.empty).toBe("true");
  });
});
