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

describe("Modal trail", () => {
  it("renders no breadcrumb without a trail", () => {
    render(<Modal header="Title" onClose={() => {}} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders no breadcrumb for a single segment", () => {
    render(<Modal header="Title" onClose={() => {}} trail={["Only"]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders two segments with the current page marked", () => {
    render(<Modal header="Title" onClose={() => {}} trail={["Previous", "Current"]} />);
    const nav = screen.getByRole("navigation");
    expect(nav.textContent).toContain("Previous");
    expect(nav.textContent).toContain("Current");
    expect(screen.getByText("Current").getAttribute("aria-current")).toBe("page");
  });

  it("collapses longer trails to ellipsis plus the last two segments", () => {
    render(
      <Modal header="Title" onClose={() => {}} trail={["First", "Second", "Third", "Fourth"]} />
    );
    const nav = screen.getByRole("navigation");
    expect(nav.textContent).not.toContain("First");
    expect(nav.textContent).not.toContain("Second");
    expect(nav.textContent).toContain("Third");
    expect(nav.textContent).toContain("Fourth");
    expect(nav.getAttribute("title")).toBe("First → Second → Third → Fourth");
  });
});
