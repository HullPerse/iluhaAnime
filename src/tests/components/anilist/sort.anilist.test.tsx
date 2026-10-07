import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import { useSettingsStore } from "@/store/settings.store";
import type { AniSortProps } from "@/types/anilist";

function renderBar(overrides: Partial<AniSortProps> = {}) {
  const props: AniSortProps = {
    sort: { key: "title", dir: "asc" },
    onSortChange: vi.fn(),
    onActivityOpen: vi.fn(),
    onFavouritesOpen: vi.fn(),
    onRandom: vi.fn(),
    onSpotlight: vi.fn(),
    hasFavourites: true,
    groupByStatus: false,
    onGroupChange: vi.fn(),
    displayMode: "scroll",
    onDisplayChange: vi.fn(),
    ...overrides,
  };
  render(<AniListSortBar {...props} />);
  return props;
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await screen.findByRole("menuitem", { name: "Activity history" });
  return user;
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("AniListSortBar more menu", () => {
  it("calls activity and spotlight actions from shared dropdown items", async () => {
    const props = renderBar();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Activity history" }));
    expect(props.onActivityOpen).toHaveBeenCalledTimes(1);

    await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Spotlight" }));
    expect(props.onSpotlight).toHaveBeenCalledTimes(1);
  });

  it("toggles group by status through the checkbox item", async () => {
    const props = renderBar();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Group by status" }));
    expect(props.onGroupChange).toHaveBeenCalledWith(true);
  });

  it("switches display mode through radio items", async () => {
    const props = renderBar();
    await openMenu();
    await screen.findByRole("menuitemradio", { name: "Pagination" });
    expect(
      screen.getByRole("menuitemradio", { name: "Infinite scroll" }).getAttribute("aria-checked")
    ).toBe("true");
    const user = userEvent.setup();
    await user.click(screen.getByRole("menuitemradio", { name: "Pagination" }));
    expect(props.onDisplayChange).toHaveBeenCalledWith("pagination");
  });
});
