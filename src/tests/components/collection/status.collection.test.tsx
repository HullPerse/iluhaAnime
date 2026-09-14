import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shrinkLevelFor } from "@/lib/collection/status.utils";
import { StatusCollection } from "@/routes/components/collection/status.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "planned", label: "Planned", color: "#9ca3af", order: 0, isCore: false, kind: "private" },
  { id: "watching", label: "Watching", color: "#3b82f6", order: 1, isCore: false, kind: "private" },
  {
    id: "completed",
    label: "Completed",
    color: "#22c55e",
    order: 2,
    isCore: false,
    kind: "private",
  },
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
          {
            id: "custom",
            label: "Custom",
            color: "#fff",
            order: 9,
            isCore: false,
            kind: "private",
          },
          {
            id: "watching",
            label: "Watching",
            color: "#3b82f6",
            order: 2,
            isCore: true,
            kind: "private",
          },
          {
            id: "planned",
            label: "Planned",
            color: "#9ca3af",
            order: 1,
            isCore: true,
            kind: "private",
          },
        ]}
        selectedStatus="all"
        onSelect={vi.fn()}
      />
    );
    expect(tabLabels()).toEqual(["All", "Planned", "Watching", "Custom"]);
  });

  it("shows the counter as count/max on a public status tab", () => {
    mockWidth(1200);
    render(
      <StatusCollection
        statuses={[
          {
            id: "share_1",
            label: "Friends",
            color: "#0ea5e9",
            order: 0,
            isCore: false,
            kind: "public",
          },
        ]}
        selectedStatus="all"
        onSelect={vi.fn()}
        counts={{ all: 3, share_1: 2 }}
      />
    );
    expect(screen.getByText("Friends (2/20)")).toBeTruthy();
    expect(screen.getByText("All (3)")).toBeTruthy();
  });

  it("renders the share button only for a selected public status", async () => {
    mockWidth(1200);
    const user = userEvent.setup();
    const onShare = vi.fn();
    const mixed: CollectionStatusDef[] = [
      {
        id: "planned",
        label: "Planned",
        color: "#9ca3af",
        order: 0,
        isCore: false,
        kind: "private",
      },
      {
        id: "friends",
        label: "Friends",
        color: "#0ea5e9",
        order: 1,
        isCore: false,
        kind: "public",
      },
    ];
    const { rerender } = render(
      <StatusCollection
        statuses={mixed}
        selectedStatus="friends"
        onSelect={vi.fn()}
        onShare={onShare}
      />
    );
    const share = screen.getByRole("button", { name: "Copy share link for this status" });
    await user.click(share);
    expect(onShare).toHaveBeenCalledTimes(1);
    rerender(
      <StatusCollection
        statuses={mixed}
        selectedStatus="planned"
        onSelect={vi.fn()}
        onShare={onShare}
      />
    );
    expect(screen.queryByRole("button", { name: "Copy share link for this status" })).toBeNull();
    rerender(
      <StatusCollection
        statuses={mixed}
        selectedStatus="all"
        onSelect={vi.fn()}
        onShare={onShare}
      />
    );
    expect(screen.queryByRole("button", { name: "Copy share link for this status" })).toBeNull();
    rerender(<StatusCollection statuses={mixed} selectedStatus="friends" onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Copy share link for this status" })).toBeNull();
  });
});
