import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpenCards from "@/routes/components/collection/open.cards";
import { patchSettings } from "@/store/settings.store";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";

import { makeOpenedCards, makeOpening, makePack } from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

beforeEach(() => {
  patchSettings({ enableAnimations: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("collection pack opening", () => {
  it("keeps the dialog open while the pack is being opened", async () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    const onClose = vi.fn();
    renderWithCardsClient(<OpenCards pack={makePack()} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Закрыть")).toHaveProperty("disabled", true);
  });
  it("invalidates cached packs if opening finishes after the dialog unmounts", async () => {
    let finish!: (value: unknown) => void;
    mockInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = queryKeys.cardsPacksScope();
    client.setQueryData(key, [makePack()]);
    const view = render(
      <QueryClientProvider client={client}>
        <OpenCards pack={makePack()} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      finish(makeOpening());
    });
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  });
  it("flips only on click, ignores a rapid second flip and enables Take after all cards", async () => {
    mockInvoke.mockResolvedValue(makeOpening());
    const onClose = vi.fn();
    renderWithCardsClient(<OpenCards pack={makePack()} onClose={onClose} />);

    expect(await screen.findByTestId("card-flip-0")).toBeTruthy();
    expect(screen.getAllByTestId("reveal-row")).toHaveLength(2);
    expect(screen.getByTestId("card-flip-0").dataset.sourcePlacement).toBe("below");
    expect(screen.getByTestId("card-flip-4").dataset.sourcePlacement).toBe("above");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Flip all" })).toBeNull();

    const finish = screen.getByRole("button", { name: "Забрать" });
    expect(finish).toHaveProperty("disabled", true);
    const first = screen.getByTestId("card-flip-0");
    expect(first.dataset.flipped).toBe("false");

    fireEvent.click(first);
    expect(first.dataset.flipped).toBe("true");
    expect(screen.getByTestId("card-source").textContent).toContain("Shingeki no Kyojin");

    fireEvent.click(first);
    expect(first.dataset.flipped).toBe("true");
    expect(finish).toHaveProperty("disabled", true);

    for (let index = 0; index < 7; index += 1) {
      fireEvent.click(screen.getByTestId(`card-flip-${index}`));
    }
    for (let index = 0; index < 7; index += 1) {
      expect(screen.getByTestId(`card-flip-${index}`).dataset.flipped).toBe("true");
    }
    expect(finish).toHaveProperty("disabled", false);

    fireEvent.click(finish);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText("Pack summary")).toBeNull();
  });

  it("shows the manga source for a character without an anime", async () => {
    const cards = makeOpenedCards().map((card, index) =>
      index === 0
        ? {
            ...card,
            kind: "character" as const,
            collectionAnimeId: null,
            collectionTitle: "One Piece",
            collectionCoverUrl: null,
          }
        : card
    );
    mockInvoke.mockResolvedValue(makeOpening(cards));
    renderWithCardsClient(<OpenCards pack={makePack()} onClose={vi.fn()} />);

    const first = await screen.findByTestId("card-flip-0");
    fireEvent.click(first);

    const source = screen.getByTestId("card-source");
    expect(source.textContent).toContain("Из манги");
    expect(source.textContent).toContain("One Piece");
  });

  it("reveal all flips every card without closing the reveal", async () => {
    mockInvoke.mockResolvedValue(makeOpening());
    const onClose = vi.fn();
    renderWithCardsClient(<OpenCards pack={makePack()} onClose={onClose} />);

    await screen.findByTestId("card-flip-0");
    fireEvent.click(screen.getByRole("button", { name: "Раскрыть все" }));

    for (let index = 0; index < 7; index += 1) {
      expect(screen.getByTestId(`card-flip-${index}`).dataset.flipped).toBe("true");
    }
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Забрать" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes the overlay with Escape", async () => {
    mockInvoke.mockResolvedValue(makeOpening());
    const onClose = vi.fn();
    renderWithCardsClient(<OpenCards pack={makePack()} onClose={onClose} />);

    await screen.findByTestId("card-flip-0");
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the pack and retries with the same id after a failure", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("AniList is unavailable"))
      .mockResolvedValue(makeOpening());

    renderWithCardsClient(<OpenCards pack={makePack()} onClose={vi.fn()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Не удалось открыть пак. Пак не потрачен.");

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByTestId("card-flip-0")).toBeTruthy();
    const opens = mockInvoke.mock.calls.filter((call) => call[0] === "cards_open_pack");
    expect(opens).toHaveLength(2);
    expect(opens.every((call) => call[1]?.packId === "pack-1")).toBe(true);
  });
});
