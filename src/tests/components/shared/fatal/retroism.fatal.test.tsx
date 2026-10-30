import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RetroismBsod } from "@/components/shared/fatal/retroism.fatal";
import type { FatalVariantProps } from "@/components/shared/fatal/shared.fatal";
import { resolveFatalTexts } from "@/lib/fatalTexts.utils";
import type { FatalInfo } from "@/types/fatal";

afterEach(() => {
  cleanup();
});

const baseInfo = (overrides: Partial<FatalInfo> = {}): FatalInfo => ({
  kind: "render",
  message: "Widget paint failed",
  stack: "Error: paint\n    at render",
  scope: "render",
  themeName: "retroism",
  route: "/collection",
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

const props = (overrides: Partial<FatalVariantProps> = {}): FatalVariantProps => ({
  info: baseInfo(),
  texts: resolveFatalTexts("en", "render"),
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

describe("RetroismBsod", () => {
  it("shows the kind label, the raw message, and the dos prompt", () => {
    localStorage.clear();
    render(<RetroismBsod {...props()} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Render error")).toBeDefined();
    expect(screen.getByText("Widget paint failed")).toBeDefined();
    expect(screen.getByText("Abort, Retry, Fail? _")).toBeDefined();
  });

  it("uses the black dos backdrop", () => {
    render(<RetroismBsod {...props()} />);
    const alert = screen.getByRole("alert") as HTMLElement;
    expect(alert.style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(alert.style.color).toBe("rgb(216, 216, 216)");
  });

  it("fires reload, safe reload, and retry through the handlers", async () => {
    const user = userEvent.setup();
    const own = props();
    render(<RetroismBsod {...own} />);
    await user.click(screen.getByRole("button", { name: "Reload app" }));
    expect(own.onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Safe reload" }));
    expect(own.onSafeReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(own.onRetry).toHaveBeenCalledTimes(1);
  });

  it("reports retry as used and reveals details", async () => {
    const user = userEvent.setup();
    const own = props();
    const view = render(<RetroismBsod {...own} />);
    await user.click(screen.getByRole("button", { name: "+ Details" }));
    expect(own.onToggleDetails).toHaveBeenCalledTimes(1);
    view.rerender(<RetroismBsod {...props({ canRetry: false, detailsOpen: true })} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByText(/scope=render/)).toBeDefined();
  });
});
