import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CollectionShell from "@/routes/components/collection/shell.cards";
import { resetCardsStore } from "@/store/cards.store";

import {
  makeBootstrap,
  makeCardsStats,
  makeCollectionPage,
  makePack,
} from "@/tests/fixtures/cards/cards.fixture";
import { mockInvoke } from "@/tests/mocks";
import { renderWithCardsClient } from "@/tests/components/collection/render.cards";

let granted = false;

beforeEach(() => {
  granted = false;
  mockInvoke.mockImplementation((command: unknown) => {
    if (command === "cards_bootstrap") return Promise.resolve(makeBootstrap());
    if (command === "cards_stats") return Promise.resolve(makeCardsStats());
    if (command === "cards_packs") return Promise.resolve(granted ? [makePack()] : []);
    if (command === "cards_collection")
      return Promise.resolve(makeCollectionPage({ items: [], total: 0 }));
    if (command === "cards_grant_test_pack") {
      granted = true;
      return Promise.resolve(makePack());
    }
    if (command === "cards_grant_test_legendary_pack") {
      granted = true;
      return Promise.resolve(makePack({ id: "legendary-test-1" }));
    }
    if (command === "cards_grant_test_effects_pack") {
      granted = true;
      return Promise.resolve(makePack({ id: "effects-test-1" }));
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  resetCardsStore();
  cleanup();
});

async function grantFromAlbumMenu(label: string) {
  fireEvent.click(screen.getByRole("tab", { name: "Album" }));
  fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  fireEvent.click(screen.getByRole("tab", { name: "Packs" }));
}

describe("collection packs", () => {
  it("grants exactly one pack and refetches the list", async () => {
    renderWithCardsClient(<CollectionShell />);

    expect(await screen.findByText("No packs yet. Complete a title to earn packs.")).toBeTruthy();
    await grantFromAlbumMenu("Test pack");

    expect(await screen.findAllByText("Standard pack")).not.toHaveLength(0);
    expect(screen.getByText("Test")).toBeTruthy();
    // Opening Packs after the grant marks the tab read, so the pack is no longer NEW.
    expect(screen.queryByTestId("pack-new")).toBeNull();
    const created = document.querySelector("time");
    expect(created?.textContent).toMatch(/ago$/);
    expect(created?.getAttribute("title")).not.toBe("");
    expect(screen.getByRole("button", { name: "Open pack" })).toBeTruthy();

    const grants = mockInvoke.mock.calls.filter(
      (call) => call[0] === "cards_grant_test_pack"
    );
    expect(grants).toHaveLength(1);
    await waitFor(() => {
      const lists = mockInvoke.mock.calls.filter((call) => call[0] === "cards_packs");
      expect(lists.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("grants the legendary test pack from the album menu", async () => {
    renderWithCardsClient(<CollectionShell />);

    await screen.findByText("No packs yet. Complete a title to earn packs.");
    await grantFromAlbumMenu("Legendary pack");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_grant_test_legendary_pack", undefined)
    );
    expect(await screen.findAllByText("Standard pack")).not.toHaveLength(0);
  });

  it("grants the effects test pack from the album menu", async () => {
    renderWithCardsClient(<CollectionShell />);

    await screen.findByText("No packs yet. Complete a title to earn packs.");
    await grantFromAlbumMenu("Effects pack");

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("cards_grant_test_effects_pack", undefined)
    );
    expect(await screen.findAllByText("Standard pack")).not.toHaveLength(0);
  });
});
