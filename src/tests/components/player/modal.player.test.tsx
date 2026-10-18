import { mockConvertFileSrc, mockInvoke } from "../../mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke, convertFileSrc: mockConvertFileSrc }));

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
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.mouseDown(dialog);
    fireEvent.mouseUp(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open when a drag starts inside the panel and ends on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
        <span>panel body</span>
      </PlayerModal>
    );
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.mouseDown(screen.getByText("panel body"));
    fireEvent.mouseUp(dialog);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the modal open when a drag starts on the backdrop and ends inside the panel", () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
        <span>panel body</span>
      </PlayerModal>
    );
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    fireEvent.mouseDown(dialog);
    fireEvent.mouseUp(screen.getByText("panel body"));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the modal open on a click without a matching backdrop press", () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
        <span>panel body</span>
      </PlayerModal>
    );
    fireEvent.click(screen.getByRole("dialog", { name: "Settings" }));
    expect(onClose).not.toHaveBeenCalled();
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

  it("swallows Escape inside an open select so the native dialog does not cancel", async () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
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
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const popup = await screen.findByRole("listbox");
    const notCancelled = fireEvent.keyDown(popup, { key: "Escape" });
    expect(notCancelled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ignores dialog cancel while a select popup is open", async () => {
    const onClose = vi.fn();
    render(
      <PlayerModal header="Settings" onClose={onClose}>
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
    await screen.findByRole("listbox");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
