import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";

import Tabs from "@/components/shared/tabs.component";
import { useNotificationStore } from "@/store/notification.store";

const mockInvoke = vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[]));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const TABS = [
  { id: "one", label: "One" },
  { id: "two", label: "Two" },
  { id: "three", label: "Three" },
] as const;

const NOTIFICATION_NAME = /Уведомления|Notifications/;

function withClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  useNotificationStore.setState({ items: [], unreadCount: 0 });
});

describe("Tabs", () => {
  it("renders all tabs and marks the active one", () => {
    render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={() => {}} />));
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Two" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Three" }).getAttribute("aria-selected")).toBe("false");
  });

  it("disables the active tab and keeps others enabled", () => {
    render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={() => {}} />));
    const two = screen.getByRole("tab", { name: "Two" });
    expect(two.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "One" }).getAttribute("disabled")).toBeNull();
    expect(screen.getByRole("tab", { name: "Three" }).getAttribute("disabled")).toBeNull();
  });

  it("calls onChange with the clicked tab id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withClient(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />));
    await user.click(screen.getByRole("tab", { name: "Three" }));
    expect(onChange).toHaveBeenCalledWith("three");
  });

  it("moves from the active tab on ArrowRight and wraps past the end", async () => {
    const onChange = vi.fn();
    const view = render(withClient(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />));
    const tablist = screen.getByRole("tablist");
    expect(tablist.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("two");

    view.rerender(withClient(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />));
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("three");

    view.rerender(withClient(<Tabs tabs={TABS} activeTab="three" onChange={onChange} />));
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("one");
  });

  it("moves from the active tab on ArrowLeft and wraps past the start", async () => {
    const onChange = vi.fn();
    const view = render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />));
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("one");

    view.rerender(withClient(<Tabs tabs={TABS} activeTab="one" onChange={onChange} />));
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("three");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    const onChange = vi.fn();
    render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />));
    const three = screen.getByRole("tab", { name: "Three" });
    fireEvent.keyDown(three, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("one");
    fireEvent.keyDown(three, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("three");
  });

  it("ignores unrelated keys", async () => {
    const onChange = vi.fn();
    render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={onChange} />));
    fireEvent.keyDown(screen.getByRole("tab", { name: "One" }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a color square when the tab provides one", () => {
    render(
      withClient(
        <Tabs
          tabs={[
            { id: "one", label: "One", color: "#4caf50" },
            { id: "two", label: "Two" },
          ]}
          activeTab="two"
          onChange={() => {}}
        />
      )
    );
    const colored = screen.getByRole("tab", { name: "One" });
    const square = colored.querySelector("span[aria-hidden='true']");
    expect(square).not.toBeNull();
    expect((square as HTMLElement).style.backgroundColor).not.toBe("");
    const plain = screen.getByRole("tab", { name: "Two" });
    expect(plain.querySelector("span[aria-hidden='true']")).toBeNull();
  });

  it("keeps the notification button outside the scrolling tablist, at the end of the strip", () => {
    const view = render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={() => {}} />));
    const strip = view.container.firstElementChild as HTMLElement;
    const tablist = screen.getByRole("tablist");
    const bell = screen.getByRole("button", { name: NOTIFICATION_NAME });
    expect(tablist).not.toBe(strip);
    expect(tablist.contains(bell)).toBe(false);
    expect(strip.lastElementChild?.contains(bell)).toBe(true);
  });

  it("opens the notification panel from the strip", async () => {
    const user = userEvent.setup();
    render(withClient(<Tabs tabs={TABS} activeTab="two" onChange={() => {}} />));
    const bell = screen.getByRole("button", { name: NOTIFICATION_NAME });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    await user.click(bell);
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByRole("region", { name: NOTIFICATION_NAME })).toBeTruthy();
  });
});
