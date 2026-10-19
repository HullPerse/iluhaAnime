import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import GameStoreModal from "@/routes/components/game/store.game";
import { notificationAtoms } from "@/store/notification.store";
import { patchSettings } from "@/store/settings.store";
import type { GameStoreProgress } from "@/types/game";

import { mockInvoke, mockListen } from "../../../mocks";

const STORE = [
  {
    key: "pong",
    title: "Pong",
    authors: ["Author One"],
    platform: "chip8",
    description: "Two paddles and a ball.",
    howto: "Keys 4 and 6 move the paddles.",
    size: 600,
    installed: false,
  },
  {
    key: "snake",
    title: "Snake",
    authors: ["TimoTriisa"],
    platform: "schip",
    description: "Classic Snake game without walls.",
    howto: null,
    size: 1438,
    installed: true,
  },
  {
    key: "partymix",
    title: "Party Mix",
    authors: ["Somebody"],
    platform: "xochip",
    description: "Needs the big machine.",
    howto: null,
    size: 2000,
    installed: false,
  },
];

const INSTALLED = {
  id: "sha1",
  name: "Pong",
  platform: "chip8",
  source: "user",
  author: "Author One",
  license: "CC0-1.0",
  size: 600,
};

const listener: { handler: ((event: { payload: GameStoreProgress }) => void) | null } = {
  handler: null,
};

function renderStore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GameStoreModal onClose={() => undefined} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  patchSettings({ language: "en", modalAnimation: false });
  listener.handler = null;
  mockListen.mockImplementation(
    (_event: string, handler: (event: { payload: GameStoreProgress }) => void) => {
      listener.handler = handler;
      return Promise.resolve(() => undefined);
    }
  );
  mockInvoke.mockImplementation(async (command: unknown) => {
    if (command === "game_store_list") return STORE;
    if (command === "game_store_install") return INSTALLED;
    return null;
  });
});

afterEach(() => {
  cleanup();
});

describe("GameStoreModal", () => {
  it("lists entries with platform, authors, controls and installed state", async () => {
    renderStore();

    await waitFor(() => expect(screen.getByText("Pong")).toBeTruthy());
    expect(screen.getByText("Snake")).toBeTruthy();
    expect(screen.getByText("Party Mix")).toBeTruthy();
    expect(screen.getByText("CHIP-8 - by Author One - 1 KB")).toBeTruthy();
    expect(screen.getByText("3 of 3")).toBeTruthy();
    expect(screen.getByText("Controls: Keys 4 and 6 move the paddles.")).toBeTruthy();
    expect(screen.getByText("Installed")).toBeTruthy();
    // Both not-installed entries, XO-CHIP included, get a download button.
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2);
  });

  it("filters by title and by author", async () => {
    renderStore();
    await waitFor(() => expect(screen.getByText("Pong")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "pong" } });
    expect(screen.queryByText("Snake")).toBeNull();
    expect(screen.getByText("Pong")).toBeTruthy();
    expect(screen.getByText("1 of 3")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "timotriisa" } });
    expect(screen.queryByText("Pong")).toBeNull();
    expect(screen.getByText("Snake")).toBeTruthy();
  });

  it("downloads the clicked entry through the backend", async () => {
    renderStore();
    await waitFor(() => expect(screen.getByText("Pong")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Download" })[0]);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("game_store_install", { key: "pong" })
    );
  });

  it("streams download progress into a bar without a success toast", async () => {
    const deferred: { resolve: (() => void) | null } = { resolve: null };
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "game_store_list") return STORE;
      if (command === "game_store_install") {
        return await new Promise((resolve) => {
          deferred.resolve = () => resolve(INSTALLED);
        });
      }
      return null;
    });
    renderStore();
    await waitFor(() => expect(screen.getByText("Pong")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Download" })[0]);

    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Downloading");
    // No bytes yet: the bar sweeps instead of claiming a value.
    expect(bar.getAttribute("aria-valuenow")).toBeNull();

    act(() => {
      listener.handler?.({ payload: { key: "pong", received: 300, total: 600 } });
    });

    await waitFor(() =>
      expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("300")
    );

    await act(async () => {
      deferred.resolve?.();
    });

    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("disables downloads while offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    renderStore();

    await waitFor(() => expect(screen.getByText("Pong")).toBeTruthy());
    expect(screen.getByText("Downloading needs an internet connection.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Download" }) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });
});
