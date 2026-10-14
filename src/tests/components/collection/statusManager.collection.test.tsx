import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusManagerCollection } from "@/routes/components/collection/statusManager.collection";
import { patchSettings } from "@/store/settings.store";
import type { CollectionStatusDef } from "@/types/collection";

const STATUSES: CollectionStatusDef[] = [
  { id: "watching", label: "Watching", color: "#3b82f6", order: 0, isCore: true, kind: "private" },
  { id: "custom_1", label: "Friends", color: "#0ea5e9", order: 1, isCore: false, kind: "private" },
];

function renderManager(onDelete: (id: string) => void = () => undefined) {
  return render(
    <StatusManagerCollection
      statuses={STATUSES}
      counts={{ custom_1: 2 }}
      onUpsert={() => undefined}
      onDelete={onDelete}
      onClose={() => undefined}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("StatusManagerCollection delete confirm", () => {
  it("shows the confirm inside the same dialog with a back button", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const user = userEvent.setup();
    renderManager();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete Friends" }));
    expect(
      screen.getByText("Items with this status will keep it, but the status cannot be restored.")
    ).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
  });

  it("returns to the list on back and deletes on confirm", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderManager(onDelete);
    await user.click(screen.getByRole("button", { name: "Delete Friends" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.queryByText("Items with this status will keep it, but the status cannot be restored.")
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Delete Friends" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Delete Friends" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("custom_1");
    expect(
      screen.queryByText("Items with this status will keep it, but the status cannot be restored.")
    ).toBeNull();
  });
});
