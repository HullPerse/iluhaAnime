import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

import PlaylistBody from "@/routes/components/player/media/playlist.player";
import { useSettingsStore } from "@/store/settings.store";

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled === true;
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  invokeMock.mockReset();
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

describe("PlaylistBody locked", () => {
  it("disables play and current-remove inside a room", async () => {
    render(
      <PlaylistBody
        locked
        onMove={async () => undefined}
        onPlay={async () => undefined}
        onRemove={async () => undefined}
      />
    );

    const blocked = await screen.findAllByTitle("Leave the room to open a different file");
    expect(blocked).toHaveLength(2);
    for (const element of blocked) expect(isDisabled(element)).toBe(true);
  });

  it("leaves play enabled outside a room", async () => {
    render(
      <PlaylistBody
        onMove={async () => undefined}
        onPlay={async () => undefined}
        onRemove={async () => undefined}
      />
    );

    const play = await screen.findByTitle("Play");
    expect(isDisabled(play)).toBe(false);
  });
});
