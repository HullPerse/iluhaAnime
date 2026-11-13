import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppRouter } from "@/routes/__root";
import { patchSettings } from "@/store/settings.store";
import { mockInvoke, mockListen } from "@/tests/mocks";

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

const renderAt = (href: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [href] }));
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
};

beforeEach(() => {
  patchSettings({
    language: "en",
    searchTabEnabled: true,
    torrentTabEnabled: true,
    playerTabEnabled: true,
    anilistTabEnabled: true,
    collectionTabEnabled: true,
    streamTabEnabled: true,
    newsTabEnabled: true,
    gameTabUnlocked: true,
  });
  mockInvoke.mockImplementation((command: string) => {
    if (
      command === "list_collection_items" ||
      command === "list_custom_field_defs" ||
      command === "list_collection_statuses"
    ) {
      return Promise.resolve([]);
    }
    return Promise.resolve(null);
  });
  mockListen.mockResolvedValue(vi.fn());
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("route surfaces", () => {
  const surfaces: readonly [string, () => HTMLElement][] = [
    ["/", () => screen.getByPlaceholderText("Search anime...")],
    ["/torrent", () => screen.getByText("0 torrents")],
    ["/player", () => screen.getByText("Add folder")],
    ["/anilist", () => screen.getByText("Log in to your profile")],
    ["/collection", () => screen.getByRole("heading", { name: "Collection" })],
    ["/stream", () => screen.getByRole("button", { name: "Filters" })],
    ["/settings?tab=general", () => screen.getByText("General")],
    ["/game", () => screen.getByText("ROM library")],
    ["/news", () => screen.getByRole("button", { name: "Refresh" })],
  ];

  it.each(surfaces)("mounts the real %s surface", async (href, findSurface) => {
    renderAt(href);

    await waitFor(() => expect(findSurface()).toBeTruthy(), { timeout: 12_000 });
    expect(screen.queryByText("Page not found")).toBeNull();
  });
});

describe("route modules", () => {
  it("mounts the real torrent route instead of the mocked surface", async () => {
    renderAt("/torrent");

    await waitFor(() => expect(screen.getByText("0 torrents")).toBeTruthy());
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("mounts the real settings route with its navigation", async () => {
    renderAt("/settings?tab=general");

    await waitFor(() => expect(screen.getByText("General")).toBeTruthy());
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(screen.queryByText("Page not found")).toBeNull();
  });
});
