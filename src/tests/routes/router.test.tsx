import { createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppRouter } from "@/routes/__root";
import { patchSettings } from "@/store/settings.store";

vi.mock("@/App", () => ({
  default: () => (
    <div data-testid="app-root">
      <Outlet />
    </div>
  ),
}));

vi.mock("@/routes/components/player/player.component", () => ({
  default: () => <div data-testid="player-window">player</div>,
}));

vi.mock("@/routes/search.route", () => ({
  default: () => <div data-testid="route-search">search</div>,
}));

vi.mock("@/routes/torrent.route", () => ({
  default: () => <div data-testid="route-torrent">torrent</div>,
}));

vi.mock("@/routes/player.route", () => ({
  default: () => <div data-testid="route-player">player</div>,
}));

vi.mock("@/routes/anilist.route", () => ({
  default: () => <div data-testid="route-anilist">anilist</div>,
}));

vi.mock("@/routes/collection.route", () => ({
  default: () => <div data-testid="route-collection">collection</div>,
}));

vi.mock("@/routes/settings.route", () => ({
  default: () => <div data-testid="route-settings">settings</div>,
}));

vi.mock("@/routes/game.route", () => ({
  default: () => <div data-testid="route-game">game</div>,
}));

const renderAt = (href: string) => {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [href] }));
  render(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("router", () => {
  it("renders the not-found screen for an unknown path without redirecting", async () => {
    const router = renderAt("/definitely-not-a-route");

    await waitFor(() => {
      expect(screen.getByText("Page not found")).toBeTruthy();
    });
    expect(router.state.location.pathname).toBe("/definitely-not-a-route");
  });

  it("navigates to the app from the not-found screen", async () => {
    const router = renderAt("/no-such-page");

    fireEvent.click(await screen.findByRole("button"));

    await waitFor(() => {
      expect(screen.getByTestId("app-root")).toBeTruthy();
    });
    expect(router.state.location.pathname).toBe("/");
  });

  it("renders the player window route instead of the not-found screen", async () => {
    renderAt("/player-window");

    await waitFor(() => {
      expect(screen.getByTestId("player-window")).toBeTruthy();
    });
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("renders the search surface inside the app shell for the index path", async () => {
    renderAt("/");

    await waitFor(() => {
      expect(screen.getByTestId("route-search")).toBeTruthy();
    });
    expect(screen.getByTestId("app-root")).toBeTruthy();
  });

  it("renders each tab surface for its path", async () => {
    const cases: readonly [string, string][] = [
      ["/torrent", "route-torrent"],
      ["/player", "route-player"],
      ["/anilist", "route-anilist"],
      ["/collection", "route-collection"],
    ];

    for (const [href, testId] of cases) {
      renderAt(href);
      await waitFor(() => {
        expect(screen.getByTestId(testId)).toBeTruthy();
      });
      cleanup();
    }
  });

  it("renders the settings surface with a search param tab", async () => {
    renderAt("/settings?tab=theme");

    await waitFor(() => {
      expect(screen.getByTestId("route-settings")).toBeTruthy();
    });
  });

  it("keeps a malformed torrent search param from breaking the route", async () => {
    renderAt("/torrent?page=abc&sort=bogus");

    await waitFor(() => {
      expect(screen.getByTestId("route-torrent")).toBeTruthy();
    });
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("redirects a settings-disabled tab to the first enabled tab", async () => {
    patchSettings({ torrentTabEnabled: false });

    renderAt("/torrent");

    await waitFor(() => {
      expect(screen.getByTestId("route-search")).toBeTruthy();
    });
    expect(screen.queryByTestId("route-torrent")).toBeNull();
  });

  it("renders the game surface once the secret tab is unlocked", async () => {
    patchSettings({ gameTabUnlocked: true });

    renderAt("/game");

    await waitFor(() => {
      expect(screen.getByTestId("route-game")).toBeTruthy();
    });
  });

  it("redirects the locked game tab to the first enabled tab", async () => {
    patchSettings({ gameTabUnlocked: false });

    renderAt("/game");

    await waitFor(() => {
      expect(screen.getByTestId("route-search")).toBeTruthy();
    });
    expect(screen.queryByTestId("route-game")).toBeNull();
  });
});
