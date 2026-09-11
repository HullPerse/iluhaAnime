import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shrinkLevelFor, StatusCollection } from "@/routes/components/collection/status.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: false },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: false },
  { id: "completed", label: "Completed", color: "#22c55e", order: 2, isCore: false },
];

function mockWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    value: width,
    configurable: true,
  });
}

function renderStrip(selectedStatus: CollectionStatus | "all" = "all") {
  const onSelect = vi.fn();
  render(
    <StatusCollection statuses={STATUSES} selectedStatus={selectedStatus} onSelect={onSelect} />
  );
  return { onSelect };
}

function tabLabels(): (string | null)[] {
  return screen
    .getAllByRole("button")
    .map((button) => button.textContent?.trim() ?? null)
    .filter((text) => text !== null && text !== "" && text !== "Previous" && text !== "Next");
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("shrinkLevelFor", () => {
  it("steps down by text length", () => {
    expect(shrinkLevelFor("All")).toBe(0);
    expect(shrinkLevelFor("A".repeat(17))).toBe(1);
    expect(shrinkLevelFor("A".repeat(25))).toBe(2);
  });
});

describe("StatusCollection pages", () => {
  it("shows one measured row without wrapping", () => {
    mockWidth(500);
    renderStrip();
    expect(tabLabels()).toEqual(["All", "Planned", "Watching"]);
  });

  it("steps pages forward and back with wraparound", async () => {
    mockWidth(500);
    const user = userEvent.setup();
    const { onSelect } = renderStrip();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(tabLabels()).toEqual(["Completed"]);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(tabLabels()).toEqual(["All", "Planned", "Watching"]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects a tab on click", async () => {
    mockWidth(500);
    const user = userEvent.setup();
    const { onSelect } = renderStrip();
    await user.click(screen.getByRole("button", { name: /Planned/ }));
    expect(onSelect).toHaveBeenCalledWith("planned");
  });

  it("jumps the window to the selected status", () => {
    mockWidth(500);
    renderStrip("completed");
    expect(tabLabels()).toEqual(["Completed"]);
  });

  it("shows counts inside the fixed tabs", () => {
    mockWidth(900);
    render(
      <StatusCollection
        statuses={STATUSES}
        selectedStatus="all"
        onSelect={vi.fn()}
        counts={{ watching: 4 }}
      />
    );
    expect(screen.getByText(/Watching \(4\)/)).toBeTruthy();
  });

  it("lists custom statuses after core ones", () => {
    mockWidth(1200);
    render(
      <StatusCollection
        statuses={[
          { id: "custom", label: "Custom", color: "#fff", order: 9, isCore: false },
          { id: "watching", label: "Watching", color: "#3b82f6", order: 2, isCore: true },
          { id: "planned", label: "Planned", color: "#9ca3af", order: 1, isCore: true },
        ]}
        selectedStatus="all"
        onSelect={vi.fn()}
      />
    );
    expect(tabLabels()).toEqual(["All", "Planned", "Watching", "Custom"]);
  });
});
