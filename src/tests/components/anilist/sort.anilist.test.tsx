import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import { useSettingsStore } from "@/store/settings.store";

function renderSort(overrides: Partial<React.ComponentProps<typeof AniListSortBar>> = {}) {
  const defaultProps = {
    sort: { key: "title" as const, dir: "desc" as const },
    onSortChange: vi.fn(),
    onActivityOpen: vi.fn(),
    onFavouritesOpen: vi.fn(),
    onRandom: vi.fn(),
    onSpotlight: vi.fn(),
    hasFavourites: true,
    groupByStatus: false,
    onGroupChange: vi.fn(),
    displayMode: "pagination" as const,
    onDisplayChange: vi.fn(),
  };
  return {
    ...render(<AniListSortBar {...defaultProps} {...overrides} />),
    props: defaultProps,
  };
}
beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => cleanup());

describe("AniListSortBar", () => {
  it("marks the active sort key as current", () => {
    renderSort();
    expect(screen.getByRole("button", { name: "Title" }).getAttribute("aria-current")).toBe("true");
  });

  it("pages through sort keys with the chevrons and wraps around", async () => {
    const user = userEvent.setup();
    renderSort();
    expect(screen.queryByText("Rating")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Next" })[0]!);
    expect(screen.getByText("Rating")).not.toBeNull();
    expect(screen.queryByText("Title")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Previous" })[0]!);
    expect(screen.getByText("Title")).not.toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Previous" })[0]!);
    expect(screen.getByText("Status")).not.toBeNull();
  });

  it("applies the natural direction when the key changes", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderSort({ sort: { key: "title", dir: "asc" }, onSortChange });
    const next = screen.getAllByRole("button", { name: "Next" })[0]!;
    await user.click(next);
    await user.click(next);
    await user.click(next);
    await user.click(screen.getByText("Progress"));
    expect(onSortChange).toHaveBeenCalledWith({ key: "progress", dir: "desc" });
  });

  it("resets to ascending when switching back to titles", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderSort({ sort: { key: "progress", dir: "desc" }, onSortChange });
    expect(screen.getByText("Progress")).not.toBeNull();
    const previous = screen.getAllByRole("button", { name: "Previous" })[0]!;
    await user.click(previous);
    await user.click(previous);
    await user.click(previous);
    await user.click(screen.getByText("Title"));
    expect(onSortChange).toHaveBeenCalledWith({ key: "title", dir: "asc" });
  });

  it("toggles the direction when clicking the active key", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderSort({ sort: { key: "title", dir: "desc" }, onSortChange });
    await user.click(screen.getByRole("button", { name: "Title" }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "title", dir: "asc" });
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

describe("AniListSortBar view toggles", () => {
  it("calls onGroupChange when the group toggle is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderSort();
    await user.click(screen.getByRole("button", { name: "Group by status" }));
    expect(props.onGroupChange).toHaveBeenCalledWith(true);
  });

  it("marks the group toggle pressed when grouped", () => {
    renderSort({ groupByStatus: true });
    expect(
      screen.getByRole("button", { name: "Group by status" }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("cycles the display mode when the display toggle is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderSort();
    await user.click(screen.getByRole("button", { name: "Pagination" }));
    expect(props.onDisplayChange).toHaveBeenCalledWith("scroll");
  });
});
