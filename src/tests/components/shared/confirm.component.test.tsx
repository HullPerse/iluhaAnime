import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete"
        message="Sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the title, message and default labels", () => {
    render(
      <ConfirmDialog
        open
        title="Delete?"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("Delete?")).toBeTruthy();
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy();
  });

  it("renders custom labels", () => {
    render(
      <ConfirmDialog
        open
        title="T"
        message="M"
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Да" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Нет" })).toBeTruthy();
  });

  it("calls onConfirm and onCancel on the respective buttons", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="T"
        message="M"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
