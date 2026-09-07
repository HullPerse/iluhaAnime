import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SearchFiltersModal from "@/routes/components/search/filters.modal";
import { useSettingsStore } from "@/store/settings.store";
import type { SearchFilters } from "@/types/search";

const FILTERS: SearchFilters = {
  minSeeders: 0,
  hasMagnet: false,
  quality: "all",
  language: "all",
  sizeMin: 0,
  sizeMax: 0,
  codec: "all",
};

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("SearchFiltersModal sort section", () => {
  it("hides the sort controls without sort props", () => {
    render(
      <SearchFiltersModal
        open
        filters={FILTERS}
        onApply={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("Sort:")).toBeNull();
  });

  it("reports sort changes immediately", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <SearchFiltersModal
        open
        filters={FILTERS}
        onApply={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
        sort="seeders"
        direction="desc"
        onSortChange={onSortChange}
        onDirectionChange={vi.fn()}
      />
    );
    const row = screen.getByText("Sort:").closest("div");
    if (!row) throw new Error("Sort row not found");
    await user.click(within(row).getByRole("combobox"));
    await user.click(await screen.findByText("Leechers"));
    expect(onSortChange).toHaveBeenCalledWith("leechers");
  });

  it("reports direction toggles", async () => {
    const user = userEvent.setup();
    const onDirectionChange = vi.fn();
    render(
      <SearchFiltersModal
        open
        filters={FILTERS}
        onApply={vi.fn()}
        onReset={vi.fn()}
        onClose={vi.fn()}
        sort="seeders"
        direction="desc"
        onSortChange={vi.fn()}
        onDirectionChange={onDirectionChange}
      />
    );
    await user.click(screen.getByTitle("Descending"));
    expect(onDirectionChange).toHaveBeenCalledTimes(1);
  });
});
