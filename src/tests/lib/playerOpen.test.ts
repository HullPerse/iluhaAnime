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

    expect(playerOpenArgs()).toEqual([
      { files: ["D:/a.mkv"], resume: 0, startIndex: undefined },
    ]);
  });

  it("opens the player without resume", async () => {
    await openPlayer(["D:/a.mkv"]);

    expect(playerOpenArgs()).toEqual([
      { files: ["D:/a.mkv"], resume: undefined, startIndex: undefined },
    ]);
  });

  it("keeps the queue order and starts at the chosen episode", async () => {
    await openPlayer(["ep1.mkv", "ep2.mkv", "ep3.mkv"], 10, 2);

    expect(playerOpenArgs()).toEqual([
      { files: ["ep1.mkv", "ep2.mkv", "ep3.mkv"], resume: 10, startIndex: 2 },
    ]);
  });
});
