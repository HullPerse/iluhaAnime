import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FatalVariantProps } from "@/components/shared/fatal/shared.fatal";
import { YorhaBsod } from "@/components/shared/fatal/yorha.fatal";
import { resolveFatalTexts } from "@/lib/fatal/texts.utils";
import type { FatalInfo } from "@/types/fatal";

afterEach(() => {
  cleanup();
});

const baseInfo = (overrides: Partial<FatalInfo> = {}): FatalInfo => ({
  kind: "chunk",
  message: "Failed to fetch dynamically imported module",
  stack: "Error: chunk\n    at load",
  scope: "render",
  themeName: "yorha",
  route: "/search",
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

const props = (overrides: Partial<FatalVariantProps> = {}): FatalVariantProps => ({
  info: baseInfo(),
  texts: resolveFatalTexts("en", "chunk"),
  canRetry: true,
  safe: false,
  detailsOpen: false,
  copied: false,
  reloadRef: { current: null } as RefObject<HTMLButtonElement | null>,
  onToggleDetails: vi.fn(),
  onReload: vi.fn(),
  onSafeReload: vi.fn(),
  onRetry: vi.fn(),
  onCopy: vi.fn(),
  ...overrides,
});

describe("YorhaBsod", () => {
  it("shows the pod banner, the kind label, and the raw message", () => {
    localStorage.clear();
    render(<YorhaBsod {...props()} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("ERROR // SYSTEM FAILURE")).toBeDefined();
    expect(screen.getByText("Chunk load error")).toBeDefined();
    expect(screen.getByText("Failed to fetch dynamically imported module")).toBeDefined();
  });

  it("uses the dark terminal backdrop", () => {
    render(<YorhaBsod {...props()} />);
    expect((screen.getByRole("alert") as HTMLElement).style.backgroundColor).toBe(
      "rgb(31, 27, 24)"
    );
  });

  it("fires reload, safe reload, retry, and copy through the handlers", async () => {
    const user = userEvent.setup();
    const own = props();
    render(<YorhaBsod {...own} />);
    await user.click(screen.getByRole("button", { name: "Reload app" }));
    expect(own.onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Safe reload" }));
    expect(own.onSafeReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(own.onRetry).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Copy details" }));
    expect(own.onCopy).toHaveBeenCalledTimes(1);
  });

  it("reports retry as used and shows the copied state", () => {
    const first = render(<YorhaBsod {...props()} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    first.unmount();
    render(<YorhaBsod {...props({ canRetry: false, copied: true })} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.getByText((_content, el) => el?.textContent === "* Retry already used")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Copied" })).toBeDefined();
  });

  it("toggles details open and closed", async () => {
    const user = userEvent.setup();
    const own = props();
    const view = render(<YorhaBsod {...own} />);
    await user.click(screen.getByRole("button", { name: "+ Details" }));
    expect(own.onToggleDetails).toHaveBeenCalledTimes(1);
    view.rerender(<YorhaBsod {...props({ detailsOpen: true })} />);
    expect(screen.getByText(/scope=render/)).toBeDefined();
  });

  it("shows the safe note in safe mode", () => {
    render(<YorhaBsod {...props({ safe: true })} />);
    expect(
      screen.getByText((_content, el) => el?.textContent === "* Safe mode: default theme")
    ).toBeDefined();
  });
});
