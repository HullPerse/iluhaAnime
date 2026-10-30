import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FatalVariantProps } from "@/types/core/shared.fatal";
import { TerminalBsod } from "@/components/shared/fatal/terminal.fatal";
import { resolveFatalTexts } from "@/lib/core/fatalTexts.utils";
import type { FatalInfo } from "@/types/core/fatal";

afterEach(() => {
  cleanup();
});

const baseInfo = (overrides: Partial<FatalInfo> = {}): FatalInfo => ({
  kind: "startup",
  message: "Backend did not answer in time",
  stack: "Error: timeout\n    at boot",
  scope: "startup",
  themeName: "terminal",
  route: "/",
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

const props = (overrides: Partial<FatalVariantProps> = {}): FatalVariantProps => ({
  info: baseInfo(),
  texts: resolveFatalTexts("en", "startup"),
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

describe("TerminalBsod", () => {
  it("shows the panic banner, the kind label, and the raw message", () => {
    localStorage.clear();
    render(<TerminalBsod {...props()} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Kernel panic - not syncing")).toBeDefined();
    expect(screen.getByText("Startup error")).toBeDefined();
    expect(screen.getByText("Backend did not answer in time")).toBeDefined();
  });

  it("uses the black and green terminal backdrop", () => {
    render(<TerminalBsod {...props()} />);
    const alert = screen.getByRole("alert") as HTMLElement;
    expect(alert.style.backgroundColor).toBe("rgb(12, 12, 12)");
    expect(alert.style.color).toBe("rgb(0, 255, 65)");
  });

  it("fires reload, retry, and copy through the handlers", async () => {
    const user = userEvent.setup();
    const own = props();
    render(<TerminalBsod {...own} />);
    await user.click(screen.getByRole("button", { name: "Reload app" }));
    expect(own.onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(own.onRetry).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Copy details" }));
    expect(own.onCopy).toHaveBeenCalledTimes(1);
  });

  it("reports retry as used and reveals details", async () => {
    const user = userEvent.setup();
    const own = props();
    const view = render(<TerminalBsod {...own} />);
    await user.click(screen.getByRole("button", { name: "+ Details" }));
    expect(own.onToggleDetails).toHaveBeenCalledTimes(1);
    view.rerender(<TerminalBsod {...props({ canRetry: false, detailsOpen: true })} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByText(/scope=startup/)).toBeDefined();
  });
});
