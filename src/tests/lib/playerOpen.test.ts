import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

import { resetTransportInflight } from "@/api/transport.api";
import { openPlayer } from "@/lib/player/playback.utils";

function playerOpenArgs(): Array<Record<string, unknown> | undefined> {
  return invokeMock.mock.calls.filter(([name]) => name === "player_open").map(([, args]) => args);
}

beforeEach(() => {
  invokeMock.mockReset();
  resetTransportInflight();
  invokeMock.mockImplementation(() => Promise.resolve(undefined));
});

describe("openPlayer", () => {
  it("opens the player with files and resume", async () => {
    await openPlayer(["D:/a.mkv"], 0);

    expect(playerOpenArgs()).toEqual([{ files: ["D:/a.mkv"], resume: 0 }]);
  });

  it("opens the player without resume", async () => {
    await openPlayer(["D:/a.mkv"]);

    expect(playerOpenArgs()).toEqual([{ files: ["D:/a.mkv"], resume: undefined }]);
  });
});
