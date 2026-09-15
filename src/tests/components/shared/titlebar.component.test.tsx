import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TitleBar from "@/components/shared/titlebar.component";
import { useSettingsStore } from "@/store/settings.store";

const minimize = vi.fn(() => Promise.resolve());
const toggleMaximize = vi.fn(() => Promise.resolve());
const close = vi.fn(() => Promise.resolve());
const startDragging = vi.fn(() => Promise.resolve());
const isMaximized = vi.fn(() => Promise.resolve(false));
const unlisten = vi.fn();
let resizeHandler: (() => void) | undefined;

const onResized = vi.fn((handler: () => void) => {
  resizeHandler = handler;
  return Promise.resolve(unlisten);
});

const windowMock = { close, isMaximized, minimize, onResized, startDragging, toggleMaximize };

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock,
}));

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
  resizeHandler = undefined;
  for (const spy of [
    minimize,
    toggleMaximize,
    close,
    startDragging,
    isMaximized,
    onResized,
    unlisten,
  ]) {
    spy.mockClear();
  }
  isMaximized.mockResolvedValue(false);
});

afterEach(cleanup);

async function renderBar(children?: ReactNode) {
  const view = render(<TitleBar title="iluhaAnime">{children}</TitleBar>);
  await waitFor(() => expect(isMaximized).toHaveBeenCalled());
  return view;
}

describe("TitleBar", () => {
  it("renders the window title and the right side slot", async () => {
    await renderBar(<span>tray</span>);
    expect(screen.getByText("iluhaAnime")).toBeTruthy();
    expect(screen.getByText("tray")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Свернуть|Minimize/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Развернуть|Maximize/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Закрыть|Close/ })).toBeTruthy();
  });

  it("starts a window drag on a left press over the bar", async () => {
    const { container } = await renderBar();
    const bar = container.querySelector(".ui-titlebar");
    expect(bar).not.toBeNull();
    fireEvent.mouseDown(bar as Element, { button: 0 });
    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("ignores right button presses and presses starting on a control", async () => {
    const { container } = await renderBar(<span>tray</span>);
    const bar = container.querySelector(".ui-titlebar") as Element;
    fireEvent.mouseDown(bar, { button: 2 });
    fireEvent.mouseDown(screen.getByRole("button", { name: /Свернуть|Minimize/ }));
    fireEvent.mouseDown(screen.getByText("tray"));
    expect(startDragging).not.toHaveBeenCalled();
  });

  it("toggles maximize on double click but not from a control", async () => {
    await renderBar();
    fireEvent.doubleClick(screen.getByText("iluhaAnime"));
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByRole("button", { name: /Закрыть|Close/ }));
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("minimizes and closes the window from the controls", async () => {
    const user = userEvent.setup();
    await renderBar();
    await user.click(screen.getByRole("button", { name: /Свернуть|Minimize/ }));
    expect(minimize).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /Закрыть|Close/ }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("toggles maximize from the control", async () => {
    const user = userEvent.setup();
    await renderBar();
    await user.click(screen.getByRole("button", { name: /Развернуть|Maximize/ }));
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("follows the maximized state of the native window", async () => {
    await renderBar();
    isMaximized.mockResolvedValue(true);
    resizeHandler?.();
    expect(await screen.findByRole("button", { name: /Восстановить|Restore/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Развернуть$|^Maximize$/ })).toBeNull();

    isMaximized.mockResolvedValue(false);
    resizeHandler?.();
    expect(await screen.findByRole("button", { name: /Развернуть|Maximize/ })).toBeTruthy();
  });

  it("stops listening to window resizes on unmount", async () => {
    const { unmount } = await renderBar();
    expect(onResized).toHaveBeenCalledTimes(1);
    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });
});
