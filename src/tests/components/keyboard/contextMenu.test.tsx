import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContextMenu from "@/components/shared/contextMenu.component";
import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";

function entries(onSelect = vi.fn()): ContextMenuEntry[] {
  return [
    { kind: "item", id: "first", label: "common.close", onSelect },
    { kind: "item", id: "disabled", label: "common.cancel", onSelect, disabled: true },
    { kind: "separator", id: "sep" },
    { kind: "item", id: "last", label: "common.delete", onSelect, variant: "destructive" },
  ];
}

afterEach(() => {
  cleanup();
});

describe("ContextMenu", () => {
  it("renders items and the separator while open", () => {
    render(
      <ContextMenu entries={entries()} open>
        <button type="button">row</button>
      </ContextMenu>
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("opens on a right click on the trigger", async () => {
    render(
      <ContextMenu entries={entries()}>
        <button type="button">row</button>
      </ContextMenu>
    );
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
    fireEvent.contextMenu(screen.getByText("row"));
    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(3));
  });

  it("runs the item action on click", async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu entries={entries(onSelect)} open>
        <button type="button">row</button>
      </ContextMenu>
    );
    await userEvent.click(screen.getAllByRole("menuitem")[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("keeps a disabled item inert", () => {
    render(
      <ContextMenu entries={entries()} open>
        <button type="button">row</button>
      </ContextMenu>
    );
    expect(screen.getAllByRole("menuitem")[1].getAttribute("aria-disabled")).toBe("true");
  });

  it("asks to close on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <ContextMenu entries={entries()} open onOpenChange={onOpenChange}>
        <button type="button">row</button>
      </ContextMenu>
    );
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
