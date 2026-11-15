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
    language: "ru",
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
    ["/", () => screen.getByPlaceholderText("Найти аниме...")],
    ["/torrent", () => screen.getByText("Торрентов: 0")],
    ["/player", () => screen.getByText("Добавить папку")],
    ["/anilist", () => screen.getByText("Войдите в профиль")],
    ["/collection", () => screen.getByRole("tab", { name: "iluhaGuesser" })],
    ["/stream", () => screen.getByRole("button", { name: "Фильтры" })],
    ["/settings?tab=general", () => screen.getByText("Общие")],
    ["/game", () => screen.getByText("Библиотека ROM")],
    ["/news", () => screen.getByRole("button", { name: "Обновить" })],
  ];

  it.each(surfaces)("mounts the real %s surface", async (href, findSurface) => {
    renderAt(href);

    await waitFor(() => expect(findSurface()).toBeTruthy(), { timeout: 12_000 });
    expect(screen.queryByText("Страница не найдена")).toBeNull();
  });
});

describe("route modules", () => {
  it("mounts the real torrent route instead of the mocked surface", async () => {
    renderAt("/torrent");

    await waitFor(() => expect(screen.getByText("Торрентов: 0")).toBeTruthy());
    expect(screen.queryByText("Страница не найдена")).toBeNull();
  });

  it("mounts the real settings route with its navigation", async () => {
    renderAt("/settings?tab=general");

    await waitFor(() => expect(screen.getByText("Общие")).toBeTruthy());
    expect(screen.getByRole("navigation", { name: "Разделы" })).toBeTruthy();
    expect(screen.queryByText("Страница не найдена")).toBeNull();
  });
});
