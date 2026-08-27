import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import { useSettingsStore } from "@/store/settings.store";

function renderSort(
  overrides: Partial<React.ComponentProps<typeof AniListSortBar>> = {}
) {
  const defaultProps = {
    sort: { key: "title" as const, dir: "desc" as const },
    onSortChange: vi.fn(),
    onActivityOpen: vi.fn(),
    onFavouritesOpen: vi.fn(),
    onRandom: vi.fn(),
    onHistoryOpen: vi.fn(),
    hasFavourites: true,
  };
  return {
    ...render(<AniListSortBar {...defaultProps} {...overrides} />),
    props: defaultProps,
  };
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("AniListSortBar", () => {
  it("renders sort label", () => {
    const { container } = renderSort();
    expect(container.textContent).toContain("Sort:");
  });

  it("renders three sort toggle buttons", () => {
    const { container } = renderSort();
    const section = container.querySelector("section")!;
    const buttons = section.querySelectorAll("button[data-slot='button']");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("calls onSortChange when a sort button is clicked", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const { container } = renderSort({
      sort: { key: "title", dir: "desc" },
      onSortChange,
    });
    const section = container.querySelector("section")!;
    const buttons = Array.from(
      section.querySelectorAll("button[data-slot='button']")
    );
    const titleBtn = buttons.find((b) => b.textContent?.trim() === "Title");
    expect(titleBtn).toBeTruthy();
    await user.click(titleBtn!);
    expect(onSortChange).toHaveBeenCalledOnce();
  });

  it("calls onRandom when clicking the random button", async () => {
    const user = userEvent.setup();
    const onRandom = vi.fn();
    const { container } = renderSort({ onRandom });
    const randomBtn = container.querySelector('button[aria-label*="Random"]');
    expect(randomBtn).toBeTruthy();
    await user.click(randomBtn!);
    expect(onRandom).toHaveBeenCalledOnce();
  });

  it("calls onActivityOpen when clicking the activity button", async () => {
    const user = userEvent.setup();
    const onActivityOpen = vi.fn();
    const { container } = renderSort({ onActivityOpen });
    const actBtn = container.querySelector('button[aria-label*="Activity"]');
    expect(actBtn).toBeTruthy();
    await user.click(actBtn!);
    expect(onActivityOpen).toHaveBeenCalledOnce();
  });

  it("disables the favourites button when hasFavourites is false", () => {
    const { container } = renderSort({ hasFavourites: false });
    const favBtn = container.querySelector('button[aria-label*="Favourites"]');
    expect(favBtn).toBeTruthy();
    expect(favBtn!.getAttribute("disabled")).not.toBeNull();
  });
});
