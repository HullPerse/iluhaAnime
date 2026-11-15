import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import { patchSettings } from "@/store/settings.store";
import type { AniSortProps } from "@/types/anilist/anilistUi";

const renderBar = (overrides: Partial<AniSortProps> = {}) => {
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
};

const openMenu = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Еще действия" }));
  await screen.findByRole("menuitem", { name: "История активности" });
  return user;
};

afterEach(() => cleanup());

beforeEach(() => {
  patchSettings({ language: "ru" });
});

describe("AniListSortBar more menu", () => {
  it("calls activity and spotlight actions from shared dropdown items", async () => {
    const props = renderBar();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "История активности" }));
    expect(props.onActivityOpen).toHaveBeenCalledTimes(1);

    await openMenu();
    await user.click(screen.getByRole("menuitem", { name: "Витрина" }));
    expect(props.onSpotlight).toHaveBeenCalledTimes(1);
  });

  it("toggles group by status through the checkbox item", async () => {
    const props = renderBar();
    const user = await openMenu();
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Группировать по статусу" }));
    expect(props.onGroupChange).toHaveBeenCalledWith(true);
  });

  it("switches display mode through radio items", async () => {
    const props = renderBar();
    await openMenu();
    await screen.findByRole("menuitemradio", { name: "Пагинация" });
    expect(
      screen
        .getByRole("menuitemradio", { name: "Бесконечная прокрутка" })
        .getAttribute("aria-checked")
    ).toBe("true");
    const user = userEvent.setup();
    await user.click(screen.getByRole("menuitemradio", { name: "Пагинация" }));
    expect(props.onDisplayChange).toHaveBeenCalledWith("pagination");
  });
});
