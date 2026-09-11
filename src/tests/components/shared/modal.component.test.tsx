import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import Modal from "@/components/shared/modal.component";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "ru", modalAnimation: false });
});

afterEach(cleanup);

describe("Modal", () => {
  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal header="Title" onClose={onClose} />);
    expect(screen.getByText("Title")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose via the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal header="Title" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
