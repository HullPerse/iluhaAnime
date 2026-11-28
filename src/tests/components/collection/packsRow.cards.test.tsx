import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PacksRowCards from "@/routes/components/collection/packsRow.cards";
import { patchSettings } from "@/store/settings.store";

import { makePack } from "@/tests/fixtures/cards/cards.fixture";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

beforeEach(() => {
  patchSettings({ enableAnimations: false });
});

afterEach(cleanup);

describe("collection pack row", () => {
  it("explains the guaranteed answer in a daily pack", () => {
    renderWithCardsClient(
      <PacksRowCards
        pack={makePack({ id: "daily-2026-11-27-frames", source: "daily" })}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText("Ежедневная игра")).toBeTruthy();
    expect(screen.getByText("Внутри аниме-ответ")).toBeTruthy();
  });

  it("labels a completion grant as a completion pack", () => {
    renderWithCardsClient(
      <PacksRowCards pack={makePack({ source: "status" })} onOpen={vi.fn()} />
    );

    expect(screen.getByText("За завершение")).toBeTruthy();
  });
});
