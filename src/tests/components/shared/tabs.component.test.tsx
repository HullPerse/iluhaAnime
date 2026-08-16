import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

import Tabs from "@/components/shared/tabs.component";

const TABS = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
] as const;

afterEach(cleanup);

describe("Tabs", () => {
  it("renders all tabs and marks the active one", () => {
    render(<Tabs tabs={TABS} activeTab="two" onChange={() => {}} />);
    expect(
      screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")
    ).toBe("false");
    expect(
      screen.getByRole("tab", { name: "Two" }).getAttribute("aria-selected")
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "Three" }).getAttribute("aria-selected")
    ).toBe("false");
  });

  it("calls onChange with the clicked tab id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Three" }));
    expect(onChange).toHaveBeenCalledWith("three");
  });

  it("moves to the next tab on ArrowRight and wraps past the end", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(
      <Tabs tabs={TABS} activeTab="one" onChange={onChange} />
    );
    screen.getByRole("tab", { name: "One" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("two");

    view.rerender(<Tabs tabs={TABS} activeTab="three" onChange={onChange} />);
    screen.getByRole("tab", { name: "Three" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("one");
  });

  it("moves to the previous tab on ArrowLeft and wraps past the start", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(
      <Tabs tabs={TABS} activeTab="two" onChange={onChange} />
    );
    screen.getByRole("tab", { name: "Two" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("one");

    view.rerender(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />);
    screen.getByRole("tab", { name: "One" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("three");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />);
    screen.getByRole("tab", { name: "Two" }).focus();
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("one");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("three");
  });

  it("ignores unrelated keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />);
    screen.getByRole("tab", { name: "Two" }).focus();
    await user.keyboard("a");
    expect(onChange).not.toHaveBeenCalled();
  });
});
