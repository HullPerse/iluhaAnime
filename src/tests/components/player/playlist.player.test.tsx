import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const openDialogMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

import PlaylistBody, {
  resolvePlaylistDragMove,
} from "@/routes/components/player/media/playlist.player";
import { useSettingsStore } from "@/store/settings.store";

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled === true;
}

function renderBody(overrides?: {
  onMove?: (from: number, to: number) => Promise<void>;
  onPlay?: (index: number) => Promise<void>;
  onRemove?: (index: number) => Promise<void>;
}) {
  return render(
    <PlaylistBody
      onMove={overrides?.onMove ?? (() => Promise.resolve())}
      onPlay={overrides?.onPlay ?? (() => Promise.resolve())}
      onRemove={overrides?.onRemove ?? (() => Promise.resolve())}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  invokeMock.mockReset();
  openDialogMock.mockReset();
  openDialogMock.mockResolvedValue(null);
  invokeMock.mockImplementation((command: string) => {
    if (command === "player_playlist_entries")
      return Promise.resolve([{ index: 0, filename: "ep1.mkv", title: "" }]);
    if (command === "get_video_card")
      return Promise.resolve({ path: "thumb", duration: 0, size: 0 });
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  cleanup();
});

describe("PlaylistBody", () => {
  it("leaves play enabled", async () => {
    renderBody();

    const play = await screen.findByTitle("Play");
    expect(isDisabled(play)).toBe(false);
  });

  it("queues picked files without starting playback", async () => {
    openDialogMock.mockResolvedValue(["C:\\Anime\\ep2.mkv"]);
    let playlistCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "player_playlist_entries") {
        playlistCalls += 1;
        const first = [{ index: 0, filename: "ep1.mkv", title: "" }];
        return Promise.resolve(
          playlistCalls === 1
            ? first
            : [...first, { index: 1, filename: "C:\\Anime\\ep2.mkv", title: "" }]
        );
      }
      if (command === "get_video_card")
        return Promise.resolve({ path: "thumb", duration: 0, size: 0 });
      return Promise.resolve(undefined);
    });
    renderBody();

    expect(await screen.findByText("ep1.mkv")).toBeDefined();
    expect(screen.queryByText("ep2.mkv")).toBeNull();

    await userEvent.click(await screen.findByRole("button", { name: "Add files" }));

    expect(openDialogMock).toHaveBeenCalledWith({
      multiple: true,
      filters: [{ name: "Video files", extensions: expect.any(Array) }],
    });
    expect(invokeMock).toHaveBeenCalledWith("player_append_files", {
      files: ["C:\\Anime\\ep2.mkv"],
      mode: "append",
    });
    expect(await screen.findByText("ep2.mkv")).toBeDefined();
  });

  it("does nothing when the file dialog is cancelled", async () => {
    openDialogMock.mockResolvedValue(null);
    renderBody();

    await userEvent.click(await screen.findByRole("button", { name: "Add files" }));

    expect(invokeMock).not.toHaveBeenCalledWith(
      "player_append_files",
      expect.objectContaining({ mode: "append" })
    );
  });

  it("shows one drag handle per row without breaking play", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "player_playlist_entries")
        return Promise.resolve([
          { index: 0, filename: "ep1.mkv", title: "" },
          { index: 1, filename: "ep2.mkv", title: "" },
        ]);
      if (command === "get_video_card")
        return Promise.resolve({ path: "thumb", duration: 0, size: 0 });
      return Promise.resolve(undefined);
    });
    renderBody();

    const handles = await screen.findAllByTestId("playlist-drag-handle");
    expect(handles).toHaveLength(2);

    const plays = await screen.findAllByTitle("Play");
    expect(plays).toHaveLength(2);
    expect(isDisabled(plays[0])).toBe(false);
  });

  it("moves an entry down through the button controls", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "player_playlist_entries")
        return Promise.resolve([
          { index: 0, filename: "ep1.mkv", title: "" },
          { index: 1, filename: "ep2.mkv", title: "" },
        ]);
      if (command === "get_video_card")
        return Promise.resolve({ path: "thumb", duration: 0, size: 0 });
      return Promise.resolve(undefined);
    });
    const onMove = vi.fn(() => Promise.resolve());
    renderBody({ onMove });

    const downButtons = await screen.findAllByRole("button", { name: "Move down" });
    expect(isDisabled(downButtons[0])).toBe(false);
    expect(isDisabled(downButtons[1])).toBe(true);

    await userEvent.click(downButtons[0]);
    expect(onMove).toHaveBeenCalledWith(0, 1);
  });

  it("resolves drag moves only between two different integer ids", () => {
    expect(resolvePlaylistDragMove(0, 2)).toEqual({ from: 0, to: 2 });
    expect(resolvePlaylistDragMove(0, 0)).toBeNull();
    expect(resolvePlaylistDragMove(0, undefined)).toBeNull();
    expect(resolvePlaylistDragMove("a", 1)).toBeNull();
  });
});
