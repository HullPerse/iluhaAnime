import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LAB_BINDER, LAB_CARDS, LAB_SHELF } from "@/config/cards/labFixtures.config";
import { routeTree } from "@/routes/__root.tree";
import CardsLab from "@/routes/components/collection/lab.cards";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ enableAnimations: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cards design lab", () => {
  it("registers the route in dev only", () => {
    expect(import.meta.env.DEV).toBe(true);
    const paths = (routeTree.children ?? []).map((child) =>
      "path" in child.options ? child.options.path : undefined
    );
    expect(paths).toContain("/lab/cards");
  });

  it("renders every kind, rarity and variant once", () => {
    render(<CardsLab />);

    const matrix = screen.getByTestId("lab-matrix");
    const combinations = Array.from(
      matrix.querySelectorAll<HTMLElement>("[data-lab-combination]")
    );
    expect(combinations).toHaveLength(75);
    expect(new Set(combinations.map((node) => node.dataset.labCombination)).size).toBe(75);
    expect(LAB_CARDS).toHaveLength(75);
  });

  it("runs the pack flow, closes after the reveal and skips out", async () => {
    render(<CardsLab />);

    fireEvent.click(screen.getByRole("button", { name: "Открыть пак" }));
    expect(await screen.findByTestId("card-flip-0")).toBeTruthy();

    for (let index = 0; index < 7; index += 1) {
      fireEvent.click(screen.getByTestId(`card-flip-${index}`));
    }
    fireEvent.click(screen.getByRole("button", { name: "Take" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByTestId("card-flip-0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reveal all" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    for (let index = 0; index < 7; index += 1) {
      expect(screen.getByTestId(`card-flip-${index}`).dataset.flipped).toBe("true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Take" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a 4x3 binder and the anime shelf with owned and missing slots", () => {
    render(<CardsLab />);

    expect(LAB_BINDER).toHaveLength(12);
    expect(
      screen.getByTestId("lab-binder").querySelectorAll("[data-testid='lab-binder-pocket']")
    ).toHaveLength(12);

    expect(LAB_SHELF).toHaveLength(4);
    expect(
      screen.getByTestId("lab-shelf").querySelectorAll("[data-testid='lab-shelf-item']")
    ).toHaveLength(4);
    expect(screen.getByTestId("lab-shelf").textContent).toContain("-");
  });

  it("does not import the cards API or card query hooks", () => {
    const files = import.meta.glob<string>(
      [
        "/src/config/cards/labFixtures.config.ts",
        "/src/routes/cardsLab.route.tsx",
        "/src/routes/components/collection/lab*.tsx",
      ],
      { query: "?raw", import: "default", eager: true }
    );
    expect(Object.keys(files)).toHaveLength(6);
    for (const source of Object.values(files)) {
      expect(source).not.toMatch(/@\/api\/cards\.api/u);
      expect(source).not.toMatch(/@\/hooks\/cards/u);
      expect(source).not.toMatch(/cards_[a-z_]+/u);
    }
  });
});
