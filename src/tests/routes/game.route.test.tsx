import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GameRoute from "@/routes/game.route";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { mockDialogConfirm, mockInvoke, mockListen } from "../mocks";

const SNAKE_HOWTO = "Keys 5 7 8 9 starts it and steers.";

const ROMS = [
  {
    id: "builtin:snake",
    name: "Snake",
    platform: "schip",
    source: "builtin",
    author: "TimoTriisa",
    license: "CC0-1.0",
    size: 1438,
  },
  {
    id: "sha1",
    name: "Imported",
    platform: "schip",
    source: "user",
    author: null,
    license: null,
    size: 4096,
  },
];

function renderRoute() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GameRoute />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  patchSettings({ language: "en", gameVolume: 1 });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  mockListen.mockImplementation(() => Promise.resolve(() => undefined));
  mockInvoke.mockImplementation(async (command: unknown) => {
    if (command === "game_rom_list") return ROMS;
    if (command === "game_platforms") return ["chip8", "schip", "schip11", "xochip"];
    if (command === "game_store_list") return [];
    if (command === "game_start") {
      return {
        session: 1,
        id: "builtin:snake",
        name: "Snake",
        platform: "schip",
        author: "TimoTriisa",
        license: "CC0-1.0",
        howto: SNAKE_HOWTO,
        cols: 128,
        rows: 64,
        cyclesPerSecond: 1200,
        palette: null,
      };
    }
    return null;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("game route", () => {
  it("lists bundled and imported ROMs", async () => {
    renderRoute();

    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());
    expect(screen.getByText("Imported")).toBeTruthy();
    // Only user ROMs expose a delete action.
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
  });

  it("starts the selected ROM through the backend", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("game_start", { id: "builtin:snake" })
    );
    await waitFor(() => expect(screen.getByText("Snake - SUPER-CHIP 1.0")).toBeTruthy());
    expect(screen.getByText(`Controls: ${SNAKE_HOWTO}`)).toBeTruthy();
  });

  it("deletes a user ROM after confirmation", async () => {
    mockDialogConfirm.mockResolvedValueOnce(true);
    renderRoute();
    await waitFor(() => expect(screen.getByText("Imported")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("game_rom_delete", { id: "sha1" }));
  });

  it("opens the ROM store from the library header", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Store" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("game_store_list", undefined));
    expect(screen.getByText("ROM store")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Nothing found.")).toBeTruthy());
  });

  it("sends keypad clicks to the running session", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);
    await waitFor(() => expect(screen.getByText("Snake - SUPER-CHIP 1.0")).toBeTruthy());

    fireEvent.pointerDown(screen.getByTitle("5"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("game_key", { key: 5, pressed: true, session: 1 })
    );
    fireEvent.pointerUp(screen.getByTitle("5"));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("game_key", { key: 5, pressed: false, session: 1 })
    );
  });

  it("expands the scene on demand and leaves it with Escape", async () => {
    renderRoute();
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Expand the screen" }));
    expect(screen.queryByText("Snake")).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse the screen" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());
  });

  it("persists the footer volume slider into settings", async () => {
    patchSettings({ gameVolume: 0.5 });
    renderRoute();
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());

    expect(screen.getByText("50%")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), { key: "ArrowRight" });
    expect(settingsAtoms.gameVolume.get()).toBeCloseTo(0.55);
    expect(screen.getByText("55%")).toBeTruthy();
  });

  it("retries the last ROM from the error overlay", async () => {
    let starts = 0;
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "game_rom_list") return ROMS;
      if (command === "game_platforms") return ["chip8", "schip", "schip11", "xochip"];
      if (command === "game_store_list") return [];
      if (command === "game_start") {
        starts += 1;
        if (starts === 1) throw new Error("boom");
        return {
          session: 1,
          id: "builtin:snake",
          name: "Snake",
          platform: "schip",
          author: "TimoTriisa",
          license: "CC0-1.0",
          howto: SNAKE_HOWTO,
          cols: 128,
          rows: 64,
          cyclesPerSecond: 1200,
          palette: null,
        };
      }
      return null;
    });
    renderRoute();
    await waitFor(() => expect(screen.getByText("Snake")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Play" })[0]);
    await waitFor(() => expect(screen.getByText("The session failed.")).toBeTruthy());
    expect(screen.getByText("boom")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Snake - SUPER-CHIP 1.0")).toBeTruthy());
    expect(starts).toBe(2);
  });
});
