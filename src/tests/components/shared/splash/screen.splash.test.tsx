import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SplashScreen } from "@/components/shared/splash/screen.splash";
import type { SplashStage } from "@/hooks/splash.hook";

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

  it("uses the xp boot screen for the xp theme", () => {
    render(<SplashScreen {...props({ themeName: "xp" })} />);
    expect((screen.getByRole("status") as HTMLElement).style.backgroundColor).toBe("rgb(0, 0, 0)");
  });

  it("falls back to the themed generic screen", () => {
    render(<SplashScreen {...props({ themeName: "gruvbox-dark" })} />);
    expect(screen.getByText("iluhaAnime")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("toggles fast launch through the checkbox", async () => {
    const user = userEvent.setup();
    const onToggleFastLaunch = vi.fn();
    render(<SplashScreen {...props({ onToggleFastLaunch })} />);
    await user.click(screen.getByRole("checkbox", { name: "Skip splash on startup" }));
    expect(onToggleFastLaunch).toHaveBeenCalledTimes(1);
  });

  it("renders the yorha terminal splash for the yorha theme", () => {
    render(<SplashScreen {...props({ themeName: "yorha" })} />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("ILUHAANIME")).toBeDefined();
    expect(screen.getByText(/BOOTING SYSTEM/)).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[ ] Cache_")).toBeDefined();
  });

  it("renders the terminal boot log for the terminal theme", () => {
    render(<SplashScreen {...props({ themeName: "terminal" })} />);
    expect(screen.getByText("iluhaAnime terminal boot")).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[  ..  ] Cache_")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("renders the dos boot for the retroism theme", () => {
    render(<SplashScreen {...props({ themeName: "retroism" })} />);
    expect(screen.getByText("Starting MS-DOS...")).toBeDefined();
    expect(screen.getByText("C:\\> boot 33%")).toBeDefined();
  });

  it("renders the xp boot clone for the xp theme", () => {
    const { unmount } = render(<SplashScreen {...props({ themeName: "xp" })} />);
    expect(screen.getByText("Windows XP")).toBeDefined();
    expect(screen.getByText((_content, el) => el?.textContent === "[ ] Cache")).toBeDefined();
    expect((screen.getByRole("status") as HTMLElement).style.backgroundColor).toBe("rgb(0, 0, 0)");
    unmount();
    render(<SplashScreen {...props({ themeName: "win7" })} />);
    expect(screen.getByText("Starting Windows")).toBeDefined();
  });
});
