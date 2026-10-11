import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppRouter } from "@/routes/__root";
import { patchSettings } from "@/store/settings.store";

// Both lazy route leaves are stubbed: this file pins routing behavior (which
// route renders for which path, and what an unknown path does), not the app
// shell or the player internals. The `import()` targets are the route
// boundaries, so they are the only mocked modules.
vi.mock("@/App", () => ({
  default: () => <div data-testid="app-root">app</div>,
}));

vi.mock("@/routes/components/player/player.component", () => ({
  default: () => <div data-testid="player-window">player</div>,
}));

function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<RouterProvider router={router} />);
  return router;
}

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
});
