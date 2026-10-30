import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FranchiseToolbar } from "@/routes/components/anilist/franchise/toolbar.franchise";
import { patchSettings } from "@/store/settings.store";
import type { FranchiseToolbarProps, RelationFilter } from "@/types/anilist/anilist";

const groupCounts: Record<RelationFilter, number> = {
  OTHER: 4,
  PREQUEL: 2,
  SEQUEL: 3,
  SIDE_STORY: 1,
  SPIN_OFF: 0,
};

const toolbarProps = (overrides: Partial<FranchiseToolbarProps> = {}): FranchiseToolbarProps => {
  return {
    activeFilters: new Set<RelationFilter>(["SEQUEL", "PREQUEL"]),
    groupCounts,
    searchQuery: "",
    matchCount: null,
    listView: true,
    refreshing: false,
    onToggleFilter: vi.fn(),
    onSearchChange: vi.fn(),
    onToggleView: vi.fn(),
    onFocusCurrent: vi.fn(),
    onResetLayout: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
};

const renderToolbar = (overrides: Partial<FranchiseToolbarProps> = {}) => {
  const props = toolbarProps(overrides);
  const view = render(<FranchiseToolbar {...props} />);
  return { props, view };
};

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("FranchiseToolbar filters", () => {
  it("marks active filters and reports counts", () => {
    const { props } = renderToolbar();

    const sequels = screen.getByRole("button", { name: "Sequels (3)" });
    const spinOffs = screen.getByRole("button", { name: "Spin-offs (0)" });
    expect(sequels.getAttribute("aria-pressed")).toBe("true");
    expect(spinOffs.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(sequels);
    expect(props.onToggleFilter).toHaveBeenCalledWith("SEQUEL");
  });
});

describe("FranchiseToolbar search and state", () => {
  it("reports hits and an empty result", () => {
    const { view } = renderToolbar({ matchCount: 3 });
    expect(screen.getByText("Found: 3")).toBeDefined();

    view.rerender(<FranchiseToolbar {...toolbarProps({ matchCount: 0, searchQuery: "zzz" })} />);
    expect(screen.getByText("No matches")).toBeDefined();
  });

  it("blocks the refresh button while a request runs", () => {
    renderToolbar({ refreshing: true });

    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows layout actions only in the graph view", () => {
    const { view } = renderToolbar();
    expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "To current" })).toBeNull();

    view.rerender(<FranchiseToolbar {...toolbarProps({ listView: false })} />);
    expect(screen.getByRole("button", { name: "Reset layout" })).toBeDefined();
    expect(screen.getByRole("button", { name: "To current" })).toBeDefined();
  });
});
