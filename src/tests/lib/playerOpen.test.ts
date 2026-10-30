import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockConvertFileSrc, mockInvoke as invokeMock } from "../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
  convertFileSrc: mockConvertFileSrc,
}));

import { resetTransportInflight } from "@/api/transport.api";
import { insertPlaylistFiles, openPlayer } from "@/lib/playback.utils";

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

    expect(playerOpenArgs()).toEqual([{ files: ["D:/a.mkv"], resume: 0, startIndex: undefined }]);
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

  it("forwards the live-sync watch metadata", async () => {
    const watch = {
      kind: "torrent",
      torrentId: 7,
      saveDir: "C:/T",
      anchor: "C:/T/ep1.mkv",
    } as const;
    await openPlayer(["C:/T/ep1.mkv"], undefined, 0, watch);

    expect(playerOpenArgs()).toEqual([
      { files: ["C:/T/ep1.mkv"], resume: undefined, startIndex: 0, watch },
    ]);
  });
});

describe("insertPlaylistFiles", () => {
  it("inserts paths at planned positions in one command", async () => {
    invokeMock.mockClear();
    await insertPlaylistFiles([
      { path: "C:/T/ep01.mkv", index: 0 },
      { path: "C:/T/ep03.mkv", index: 2 },
    ]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("player_insert_files", {
      items: [
        { path: "C:/T/ep01.mkv", index: 0 },
        { path: "C:/T/ep03.mkv", index: 2 },
      ],
    });
  });

  it("skips the invoke when there is nothing to insert", async () => {
    invokeMock.mockClear();
    await insertPlaylistFiles([]);

    expect(invokeMock).not.toHaveBeenCalled();
  });
});
