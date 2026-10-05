import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

import { resetTransportInflight } from "@/api/transport.api";
import { openPlayer } from "@/lib/player/playback.utils";

let role: string | null = null;

function playerOpenArgs(): Array<Record<string, unknown> | undefined> {
  return invokeMock.mock.calls.filter(([name]) => name === "player_open").map(([, args]) => args);
}

function statusCalls(): number {
  return invokeMock.mock.calls.filter(([name]) => name === "session_status").length;
}

beforeEach(() => {
  role = null;
  invokeMock.mockReset();
  resetTransportInflight();
  invokeMock.mockImplementation((command: string) => {
    if (command === "session_status") return Promise.resolve({ role });
    return Promise.resolve(undefined);
  });
});

describe("openPlayer room gate", () => {
  it("opens when no session is active", async () => {
    await openPlayer(["D:/a.mkv"], 0);

    expect(playerOpenArgs()).toEqual([{ files: ["D:/a.mkv"], resume: 0 }]);
  });

  it("blocks manual opens while a session is active", async () => {
    role = "host";
    await openPlayer(["D:/a.mkv"], 0);
    expect(playerOpenArgs()).toEqual([]);

    role = "guest";
    await openPlayer(["D:/a.mkv"], 0);
    expect(playerOpenArgs()).toEqual([]);
  });

  it("lets a room-driven open through without a status check", async () => {
    role = "host";
    await openPlayer(["D:/a.mkv"], 0, { roomDriven: true });

    expect(statusCalls()).toBe(0);
    expect(playerOpenArgs()).toEqual([{ files: ["D:/a.mkv"], resume: 0, roomDriven: true }]);
  });

  it("fails open when the status check errors", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "session_status") return Promise.reject(new Error("backend down"));
      return Promise.resolve(undefined);
    });

    await openPlayer(["D:/a.mkv"], 0);

    expect(playerOpenArgs()).toHaveLength(1);
  });
});
