import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Unlisten = () => Promise<void>;
type TauriEvent = { payload: unknown };

const tauri = vi.hoisted(() => {
  const calls: Array<{ event: string; handler: (event: TauriEvent) => void }> = [];
  const listen = (
    event: string,
    handler: (event: TauriEvent) => void
  ): Promise<Unlisten> => {
    calls.push({ event, handler });
    return Promise.resolve(async () => undefined);
  };
  return {
    calls,
    listen,
    reset: () => {
      calls.length = 0;
    },
  };
});

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: TauriEvent) => void) =>
    tauri.listen(event, handler),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) =>
    invokeMock(command, args),
}));

import { useSessionStartBridge } from "@/hooks/session/start.hook";
import { usePlaybackStore } from "@/store/player.store";
import { useSessionStore } from "@/store/session.store";

function emit(event: string, payload: unknown): void {
  const call = tauri.calls.find((entry) => entry.event === event);
  if (!call) throw new Error(`no listener registered for ${event}`);
  call.handler({ payload });
}

function calledWith(command: string, args: Record<string, unknown>): boolean {
  return invokeMock.mock.calls.some(
    ([name, received]) =>
      name === command && JSON.stringify(received) === JSON.stringify(args)
  );
}

function playerOpened(): boolean {
  return invokeMock.mock.calls.some(([name]) => name === "player_open");
}

async function waitForListener(event: string): Promise<void> {
  await waitFor(() =>
    expect(tauri.calls.some((call) => call.event === event)).toBe(true)
  );
}

beforeEach(() => {
  tauri.reset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  usePlaybackStore.setState({ hasFile: false, path: "" });
  useSessionStore.setState({ planPaths: {}, playingItemId: null });
});

describe("useSessionStartBridge", () => {
  it("opens the host-local file when the room starts an item", async () => {
    renderHook(() => useSessionStartBridge("host"));

    await waitForListener("session-start-item");
    act(() =>
      emit("session-start-item", { itemId: "i1", path: "D:/anime/ep1.mkv" })
    );

    await waitFor(() =>
      expect(
        calledWith("player_open", {
          files: ["D:/anime/ep1.mkv"],
          resume: 0,
          roomDriven: true,
        })
      ).toBe(true)
    );
    // The opened item id is the only wire identity the player reports.
    expect(useSessionStore.getState().playingItemId).toBe("i1");
  });

  it("ignores a start event without a local path", async () => {
    renderHook(() => useSessionStartBridge("host"));

    await waitForListener("session-start-item");
    act(() => emit("session-start-item", { itemId: "i1", path: null }));

    expect(playerOpened()).toBe(false);
    expect(useSessionStore.getState().playingItemId).toBeNull();
  });

  it("opens the guest's matched copy on a load command", async () => {
    useSessionStore.setState({ planPaths: { i1: "D:/anime/mine.mkv" } });
    renderHook(() => useSessionStartBridge("guest"));

    await waitForListener("session-command");
    act(() =>
      emit("session-command", {
        revision: 1,
        action: { a: "load", mediaId: "i1" },
      })
    );

    await waitFor(() =>
      expect(
        calledWith("player_open", {
          files: ["D:/anime/mine.mkv"],
          resume: 0,
          roomDriven: true,
        })
      ).toBe(true)
    );
  });

  it("leaves a load command alone when the guest has no local copy", async () => {
    renderHook(() => useSessionStartBridge("guest"));

    await waitForListener("session-command");
    act(() =>
      emit("session-command", {
        revision: 1,
        action: { a: "load", mediaId: "i1" },
      })
    );

    expect(playerOpened()).toBe(false);
  });

  it("does not reopen a file that is already loaded", async () => {
    usePlaybackStore.setState({ hasFile: true, path: "D:/anime/ep1.mkv" });
    renderHook(() => useSessionStartBridge("host"));

    await waitForListener("session-start-item");
    act(() =>
      emit("session-start-item", { itemId: "i1", path: "D:/anime/ep1.mkv" })
    );

    expect(playerOpened()).toBe(false);
  });
});
