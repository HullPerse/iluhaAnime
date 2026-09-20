import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreditSection } from "@/routes/components/anilist/detail/creditSection.detail";
import { useSettingsStore } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

const ITEMS = [
  { id: 1, image: null, label: "Eren" },
  { id: 2, image: null, label: "Mikasa", favourite: true },
];

describe("CreditSection", () => {
  it("hands the whole item back on select", async () => {
    const onSelect = vi.fn();
    render(<CreditSection header="Characters (2)" items={ITEMS} onSelect={onSelect} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Mikasa" }));

    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
    expect(screen.getByLabelText("Characters (2)")).toBeDefined();
  });

  it("shows the empty label instead of the grid, without a paging button", () => {
    render(
      <CreditSection
        header="Appears in (0)"
        items={[]}
        emptyLabel="No characters"
        hasNextPage
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("No characters")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("pages only while another page exists, and blocks a second click while loading", async () => {
    const onShowMore = vi.fn();
    const { rerender } = render(
      <CreditSection header="Characters (2)" items={ITEMS} onSelect={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();

    rerender(
      <CreditSection
        header="Characters (2)"
        items={ITEMS}
        onSelect={vi.fn()}
        hasNextPage
        onShowMore={onShowMore}
      />
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Show more" }));
    expect(onShowMore).toHaveBeenCalledTimes(1);

    rerender(
      <CreditSection
        header="Characters (2)"
        items={ITEMS}
        onSelect={vi.fn()}
        hasNextPage
        isFetchingNextPage
        onShowMore={onShowMore}
      />
    );
    const button = screen.getByRole("button", { name: "Show more" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
