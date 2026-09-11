import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusManagerCollection } from "@/routes/components/collection/statusManager.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionStatusDef } from "@/types/collection";

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("StatusManagerCollection add", () => {
  it("computes a finite order from stale rows without order", async () => {
    const user = userEvent.setup();
    const onUpsert = vi.fn();
    const stale = [
      { id: "planned", label: "Planned", color: "#9ca3af", isCore: true },
    ] as unknown as CollectionStatusDef[];
    render(
      <StatusManagerCollection
        statuses={stale}
        onUpsert={onUpsert}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("New status name"), "My status");
    await user.click(screen.getByRole("button", { name: "Add status" }));
    expect(onUpsert).toHaveBeenCalledOnce();
    const sent = onUpsert.mock.calls[0]?.[0] as CollectionStatusDef;
    expect(Number.isFinite(sent.order)).toBe(true);
  });
});

describe("StatusManagerCollection sections", () => {
  const mixed: CollectionStatusDef[] = [
    { id: "custom-b", label: "B custom", color: "#ffffff", order: 9, isCore: false },
    { id: "planned", label: "Planned", color: "#9ca3af", order: 1, isCore: true },
    { id: "custom-a", label: "A custom", color: "#000000", order: 8, isCore: false },
    { id: "watching", label: "Watching", color: "#3b82f6", order: 2, isCore: true },
  ];

  function renderSections() {
    render(
      <StatusManagerCollection
        statuses={mixed}
        onUpsert={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
  }

  it("renders core headers before custom ones", () => {
    renderSections();
    expect(screen.getByText("Built-in")).toBeTruthy();
    expect(screen.getByText("Custom")).toBeTruthy();
  });
  it("lists custom statuses after core ones", () => {
    render(
      <StatusManagerCollection
        statuses={mixed}
        onUpsert={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const lists = document.querySelectorAll("ul");
    const coreLabels = Array.from(lists[0]?.querySelectorAll("input") ?? []).map(
      (input) => (input as HTMLInputElement).value
    );
    const customLabels = Array.from(lists[1]?.querySelectorAll("input") ?? []).map(
      (input) => (input as HTMLInputElement).value
    );
    expect(coreLabels).toEqual(["Planned", "Watching"]);
    expect(customLabels).toEqual(["B custom", "A custom"]);
  });
});
