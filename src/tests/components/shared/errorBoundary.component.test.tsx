import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/components/shared/errorBoundary.component";
import { clearFatal, reportFatal } from "@/lib/core/report.utils";
import type { FatalInfo } from "@/types/core/fatal";

afterEach(() => {
  cleanup();
  clearFatal();
  vi.unstubAllGlobals();
});

function Bomb({ blow }: { blow: boolean }) {
  if (blow) throw new Error("kaboom render");
  return <p>fine</p>;
}

const liveInfo = (): FatalInfo => ({
  kind: "global-loop",
  message: "repeated unhandled rejection",
  scope: "global-loop",
  themeName: "win95",
  route: "/",
  timestamp: 1000,
  retryCount: 0,
});

describe("ErrorBoundary fatal contract", () => {
  it("catches a render crash and shows the fatal screen", () => {
    render(
      <ErrorBoundary>
        <Bomb blow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Render error")).toBeDefined();
    expect(screen.getByText("kaboom render")).toBeDefined();
  });

  it("retries once and then allows only reload", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb blow />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByText("kaboom render")).toBeDefined();
  });

  it("resets the cache and reloads on reload", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const onResetCache = vi.fn();
    render(
      <ErrorBoundary onResetCache={onResetCache} onReloadPage={reload}>
        <Bomb blow />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole("button", { name: "Reload app" }));
    expect(onResetCache).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows an escalated global-loop fatal without a render crash", () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("fine")).toBeDefined();
    act(() => {
      reportFatal(liveInfo());
    });
    expect(screen.getByText("Repeated errors")).toBeDefined();
    expect(screen.getByText("repeated unhandled rejection")).toBeDefined();
  });

  it("keeps its own crash screen when a live fatal arrives later", () => {
    render(
      <ErrorBoundary>
        <Bomb blow />
      </ErrorBoundary>
    );
    expect(screen.getByText("kaboom render")).toBeDefined();
    act(() => {
      reportFatal(liveInfo());
    });
    expect(screen.getByText("kaboom render")).toBeDefined();
    expect(screen.queryByText("repeated unhandled rejection")).toBeNull();
  });
});
