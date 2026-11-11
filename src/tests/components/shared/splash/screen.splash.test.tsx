import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SplashScreen } from "@/components/shared/splash/screen.splash";
import type { SplashStage } from "@/types/core/splash";

afterEach(() => {
  cleanup();
});

const STAGES: SplashStage[] = [
  { id: "theme", status: "done" },
  { id: "cache", status: "active" },
  { id: "tabs", status: "pending" },
];

const props = (overrides: Partial<Parameters<typeof SplashScreen>[0]> = {}) => ({
  stages: STAGES,
  themeName: "win95",
  fastLaunch: false,
  onToggleFastLaunch: vi.fn(),
  ...overrides,
});

describe("SplashScreen", () => {
  it("shows the win95 splash with stages and the opt-out", () => {
    localStorage.clear();
    render(<SplashScreen {...props()} />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("iluhaAnime")).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[x] Theme")).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[ ] Cache...")).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[ ] Tabs")).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Skip splash on startup" })).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("lists every row and counts pending warmups into progress", () => {
    render(
      <SplashScreen
        {...props({
          stages: [
            ...STAGES,
            { id: "spelling", status: "pending" },
            { id: "index", status: "pending" },
          ],
        })}
      />
    );
    expect(screen.getByText((_content, el) => el?.textContent === "[ ] Spelling")).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[ ] Anime index")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("20");
  });

  it("toggles fast launch through the checkbox", async () => {
    const user = userEvent.setup();
    const onToggleFastLaunch = vi.fn();
    render(<SplashScreen {...props({ onToggleFastLaunch })} />);
    await user.click(screen.getByRole("checkbox", { name: "Skip splash on startup" }));
    expect(onToggleFastLaunch).toHaveBeenCalledTimes(1);
  });
});
