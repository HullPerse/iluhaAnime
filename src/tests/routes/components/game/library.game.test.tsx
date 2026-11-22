import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GameLibrary from "@/routes/components/game/library.game";
import type { GameLibraryProps } from "@/types/core/library.game";
import { patchSettings } from "@/store/settings.store";
import type { GameRomInfo } from "@/types/core/game";

const ROMS: GameRomInfo[] = [
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

const renderLibrary = (overrides: Partial<GameLibraryProps> = {}): GameLibraryProps => {
  const props: GameLibraryProps = {
    roms: ROMS,
    activeId: null,
    startingId: null,
    importPending: false,
    deletingId: null,
    loading: false,
    error: null,
    onImport: vi.fn(),
    onOpenStore: vi.fn(),
    onPlay: vi.fn(),
    onDelete: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  };
  render(<GameLibrary {...props} />);

  return props;
};

beforeEach(() => {
  patchSettings({ language: "ru" });
});

afterEach(() => {
  cleanup();
});

describe("GameLibrary", () => {
  it("shows the platform, source and size of every ROM", () => {
    renderLibrary();

    expect(screen.getByText("SUPER-CHIP 1.0 - в комплекте - 2 КБ")).toBeTruthy();
    expect(screen.getByText("SUPER-CHIP 1.0 - импортированный - 4 КБ")).toBeTruthy();
  });

  it("plays the focused ROM from the keyboard", () => {
    const props = renderLibrary();
    const list = screen.getByRole("list", { name: "Библиотека ROM" });

    fireEvent.keyDown(list, { key: "ArrowDown" });
    const rows = screen.getAllByRole("listitem");
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(rows[1], { key: "Enter" });
    expect(props.onPlay).toHaveBeenCalledWith(ROMS[1]);
  });

  it("leaves Enter on row action buttons to the buttons", () => {
    const props = renderLibrary();

    fireEvent.keyDown(screen.getAllByRole("button", { name: "Играть" })[0], { key: "Enter" });
    expect(props.onPlay).not.toHaveBeenCalled();
  });

  it("marks the starting ROM with a busy Play button", () => {
    renderLibrary({ startingId: "sha1" });

    const playButtons = screen.getAllByRole("button", { name: "Играть" });
    expect(playButtons[0].getAttribute("aria-busy")).toBeNull();
    expect(playButtons[1].getAttribute("aria-busy")).toBe("true");
  });

  it("explains an empty library", () => {
    renderLibrary({ roms: [] });

    expect(screen.getByText("ROM'ов пока нет")).toBeTruthy();
    expect(
      screen.getByText("Импортируйте файл ROM (.ch8) или откройте магазин и скачайте игру.")
    ).toBeTruthy();
  });

  it("offers a reload after a list error", () => {
    const props = renderLibrary({ error: "boom" });

    expect(screen.getByText("boom")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });
});
