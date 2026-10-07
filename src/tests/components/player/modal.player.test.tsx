import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import Select from "@/components/ui/select.component";
import PlayerModal from "@/routes/components/player/media/modal.player";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("PlayerModal", () => {
  it("renders content inside a dialog overlay", () => {
    render(
      <PlayerModal header="Settings" onClose={() => undefined}>
        <span>panel body</span>
      </PlayerModal>
    );
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeDefined();
    expect(screen.getByText("panel body")).toBeDefined();
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
        <span>panel body</span>
      </PlayerModal>
    );
    fireEvent.click(screen.getByRole("dialog", { name: "Settings" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open when content is clicked", () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
        <span>panel body</span>
      </PlayerModal>
    );
    fireEvent.click(screen.getByText("panel body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the dialog closes", () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
        <span>panel body</span>
      </PlayerModal>
    );
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    fireEvent(dialog, new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders select popups inside the dialog so they stay interactive", async () => {
    render(
      <PlayerModal header="Settings" onClose={() => undefined}>
        <Select
          value="a"
          onChange={() => undefined}
          options={[
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ]}
        />
      </PlayerModal>
    );
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const popup = await screen.findByRole("listbox");
    expect(dialog.contains(popup)).toBe(true);
  });
});
