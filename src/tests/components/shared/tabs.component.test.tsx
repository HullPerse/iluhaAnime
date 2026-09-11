import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Two" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Three" }).getAttribute("aria-selected")).toBe("false");
  });

  it("disables the active tab and keeps others enabled", () => {
    render(<Tabs tabs={TABS} activeTab="two" onChange={() => {}} />);
    const two = screen.getByRole("tab", { name: "Two" });
    expect(two.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("disabled")).toBeNull();
    expect(screen.getByRole("tab", { name: "Three" }).getAttribute("disabled")).toBeNull();
  });

  it("calls onChange with the clicked tab id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Three" }));
    expect(onChange).toHaveBeenCalledWith("three");
  });

  it("moves from the active tab on ArrowRight and wraps past the end", async () => {
    const onChange = vi.fn();
    const view = render(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />);
    const tablist = screen.getByRole("tablist");
    expect(tablist.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("two");

    view.rerender(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />);
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("three");

    view.rerender(<Tabs tabs={TABS} activeTab="three" onChange={onChange} />);
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("one");
  });

  it("moves from the active tab on ArrowLeft and wraps past the start", async () => {
    const onChange = vi.fn();
    const view = render(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />);
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("one");

    view.rerender(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />);
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("three");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />);
    const three = screen.getByRole("tab", { name: "Three" });
    fireEvent.keyDown(three, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("one");
    fireEvent.keyDown(three, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("three");
  });

  it("ignores unrelated keys", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "One" }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a color square when the tab provides one", () => {
    render(
      <Tabs
        tabs={[
          { id: "one", label: "One", color: "#4caf50" },
          { id: "two", label: "Two" },
        ]}
        activeTab="two"
        onChange={() => {}}
      />,
    );
    const colored = screen.getByRole("tab", { name: "One" });
    const square = colored.querySelector("span[aria-hidden='true']");
    expect(square).not.toBeNull();
    expect((square as HTMLElement).style.backgroundColor).not.toBe("");
    const plain = screen.getByRole("tab", { name: "Two" });
    expect(plain.querySelector("span[aria-hidden='true']")).toBeNull();
  });
});
