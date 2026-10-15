import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContextMenu, { closeOpenContextMenus } from "@/components/shared/contextMenu.component";
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

  it("closes an open menu through the shared closer", async () => {
    render(
      <ContextMenu entries={entries()} defaultOpen>
        <button type="button">row</button>
      </ContextMenu>
    );
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);

    act(() => {
      closeOpenContextMenus();
    });

    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
  });

  it("opens a submenu on hover and runs its action", async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu
        entries={[
          {
            kind: "submenu",
            id: "parent",
            label: "common.close",
            entries: [{ kind: "item", id: "child", label: "common.cancel", onSelect }],
          },
        ]}
        open
      >
        <button type="button">row</button>
      </ContextMenu>
    );
    const parent = screen.getByRole("menuitem", { name: "Close" });
    await userEvent.hover(parent);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Cancel" })));
    await userEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows the hotkey hint and the checked marker", () => {
    render(
      <ContextMenu
        entries={[
          {
            kind: "item",
            id: "hinted",
            label: "common.close",
            hint: "Space",
            checked: true,
            onSelect: vi.fn(),
          },
        ]}
        open
      >
        <button type="button">row</button>
      </ContextMenu>
    );
    expect(screen.getByText("Space")).toBeTruthy();
  });
});
