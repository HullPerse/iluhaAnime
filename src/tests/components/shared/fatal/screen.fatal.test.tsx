import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FatalScreen } from "@/components/shared/fatal/screen.fatal";
import type { FatalInfo } from "@/types/fatal";

import { mockWriteText } from "../../../mocks";

afterEach(() => {
  cleanup();
});

const baseInfo = (overrides: Partial<FatalInfo> = {}): FatalInfo => ({
  kind: "chunk",
  message: "Failed to fetch dynamically imported module",
  stack: "Error: chunk\n    at load",
  scope: "render",
  themeName: "win95",
  route: "/search",
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

const handlers = () => ({
  onReload: vi.fn(),
  onSafeReload: vi.fn(),
  onRetry: vi.fn(),
});

describe("FatalScreen", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the kind label and the raw message on the win95 screen", () => {
    render(<FatalScreen info={baseInfo()} {...handlers()} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Chunk load error")).toBeDefined();
    expect(screen.getByText("Failed to fetch dynamically imported module")).toBeDefined();
  });

  it("uses the xp screen for the xp theme and generic for others", () => {
    const { unmount } = render(
      <FatalScreen info={baseInfo({ themeName: "xp" })} {...handlers()} />
    );
    expect((screen.getByRole("alert") as HTMLElement).style.backgroundColor).toBe(
      "rgb(0, 51, 153)"
    );
    unmount();
    render(<FatalScreen info={baseInfo({ themeName: "gruvbox-dark" })} {...handlers()} />);
    expect(screen.getByText("Chunk load error")).toBeDefined();
    expect(screen.getByText("Failed to fetch dynamically imported module")).toBeDefined();
  });

  it("forces the win95 screen with a safe note in safe mode", () => {
    render(<FatalScreen info={baseInfo({ themeName: "xp" })} safe {...handlers()} />);
    expect((screen.getByRole("alert") as HTMLElement).style.backgroundColor).toBe("rgb(0, 0, 170)");
    expect(
      screen.getByText((_content, el) => el?.textContent === "* Safe mode: default theme")
    ).toBeDefined();
  });

  it("offers retry once and reports it as used after a repeat crash", () => {
    const first = render(<FatalScreen info={baseInfo()} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    first.unmount();
    render(<FatalScreen info={baseInfo({ retryCount: 1 })} {...handlers()} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.getByText((_content, el) => el?.textContent === "* Retry already used")
    ).toBeDefined();
  });

  it("reveals error details and copies them to the clipboard", async () => {
    const user = userEvent.setup();
    render(<FatalScreen info={baseInfo()} {...handlers()} />);
    await user.click(screen.getByRole("button", { name: "+ Details" }));
    expect(screen.getByText(/scope=render/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Copy details" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeDefined();
    expect(mockWriteText).toHaveBeenCalled();
    const copied = String((mockWriteText.mock.calls[0] as unknown[])[0] ?? "");
    expect(copied).toContain("fatal.chunk");
    expect(copied).toContain("Failed to fetch dynamically imported module");
  });

  it("focuses reload on mount and fires the handlers", async () => {
    const user = userEvent.setup();
    const props = handlers();
    render(<FatalScreen info={baseInfo()} {...props} />);
    expect(document.activeElement?.textContent).toBe("Reload app");
    await user.click(screen.getByRole("button", { name: "Reload app" }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Safe reload" }));
    expect(props.onSafeReload).toHaveBeenCalledTimes(1);
  });

  it("retries on Escape only while retry is available", () => {
    const props = handlers();
    const view = render(<FatalScreen info={baseInfo()} {...props} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    view.rerender(<FatalScreen info={baseInfo({ retryCount: 1 })} {...props} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("localizes labels through the persisted settings language", () => {
    localStorage.setItem(
      "iluha.v1.settings",
      JSON.stringify({ f: 1, store: "settings", sv: 1, ts: 1, data: { language: "ru" } })
    );
    render(<FatalScreen info={baseInfo()} {...handlers()} />);
    expect(screen.getByText("Ошибка загрузки модуля")).toBeDefined();
    expect(screen.getByRole("button", { name: "Перезапустить" })).toBeDefined();
  });

  it("uses the yorha screen for the yorha theme", () => {
    localStorage.clear();
    render(<FatalScreen info={baseInfo({ themeName: "yorha" })} {...handlers()} />);
    expect(screen.getByText("ERROR // SYSTEM FAILURE")).toBeDefined();
    expect((screen.getByRole("alert") as HTMLElement).style.backgroundColor).toBe(
      "rgb(31, 27, 24)"
    );
  });

  it("uses the terminal and retroism screens for their themes", () => {
    localStorage.clear();
    const { unmount } = render(
      <FatalScreen info={baseInfo({ themeName: "terminal" })} {...handlers()} />
    );
    expect(screen.getByText("Kernel panic - not syncing")).toBeDefined();
    unmount();
    render(<FatalScreen info={baseInfo({ themeName: "retroism" })} {...handlers()} />);
    expect(screen.getByText("Abort, Retry, Fail? _")).toBeDefined();
  });
});
