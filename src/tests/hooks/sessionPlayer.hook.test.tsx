import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
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

import { resetTransportInflight } from "@/api/transport.api";
import { useSessionPlayer } from "@/hooks/session/player.hook";
import { SESSION_STATUS_QUERY_KEY } from "@/hooks/session/queries.hook";
import { usePlaybackStore } from "@/store/player.store";
import { useSessionStore } from "@/store/session.store";
import { useSettingsStore } from "@/store/settings.store";
import type { SessionStatus, SyncSample } from "@/types/session";

const HOST_STATUS: SessionStatus = {
  chat: [],
  hostOnline: true,
  lobbyRole: "host",
  missing: {},
  paths: {},
  peers: [],
  plan: [],
  ready: { allReady: true, peers: [] },
  role: "host",
  sessionId: "a1b2c3d4e5f60718",
  yourPeerId: null,
  ticket: null,
  waiting: null,
};

const GUEST_STATUS: SessionStatus = { ...HOST_STATUS, role: "guest" };

const RATE_SAMPLE: SyncSample = {
  awaitingRestart: false,
  correction: 1.05,
  driftMs: 400,
  haveSnapshot: true,
  identityOk: true,
  instruction: { kind: "setRate", rate: 1.05 },
  lag: "fair",
  offsetMs: 0,
  rttMs: 120,
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockInvoke(
  handler: (command: string, args?: Record<string, unknown>) => unknown
) {
  invokeMock.mockImplementation(async (command: string, args?: Record<string, unknown>) =>
    handler(command, args)
  );
}

function calledWith(command: string, args: Record<string, unknown>): boolean {
  return invokeMock.mock.calls.some(
    ([name, received]) =>
      name === command && JSON.stringify(received) === JSON.stringify(args)
  );
}

function called(command: string): boolean {
  return invokeMock.mock.calls.some(([name]) => name === command);
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useSessionStore.setState({ playingItemId: "i1" });
  usePlaybackStore.setState({
    duration: 1440,
    hasFile: true,
    muted: false,
    path: "D:/anime/ep1.mkv",
    paused: false,
    seekTarget: 0,
    speed: 1,
    timePos: 42,
    tracks: [],
  });
  tauri.reset();
  invokeMock.mockReset();
  resetTransportInflight();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe("useSessionPlayer", () => {
  it("publishes a stamped snapshot for the host", async () => {
    mockInvoke((command) => (command === "session_status" ? HOST_STATUS : undefined));
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.role).toBe("host"));

    act(() => result.current.publish());

    await waitFor(() =>
      expect(
        calledWith("session_publish_state", {
          isPlaying: true,
          mediaId: "i1",
          position: 42,
          rate: 1,
        })
      ).toBe(true)
    );
  });

  it("publishes nothing while the player is off the room plan", async () => {
    useSessionStore.setState({ playingItemId: null });
    mockInvoke((command) => (command === "session_status" ? HOST_STATUS : undefined));
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.role).toBe("host"));

    act(() => result.current.publish());
    act(() => result.current.onLocalControl({ a: "pause" }));

    await waitFor(() =>
      expect(calledWith("session_control", { action: { a: "pause" } })).toBe(true)
    );
    // No plan item is playing: the local path must never be published.
    expect(called("session_publish_state")).toBe(false);
  });

  it("relays a local control action and republishes for the host", async () => {
    mockInvoke((command) => (command === "session_status" ? HOST_STATUS : undefined));
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.role).toBe("host"));

    act(() => result.current.onLocalControl({ a: "pause" }));

    await waitFor(() =>
      expect(calledWith("session_control", { action: { a: "pause" } })).toBe(true)
    );
    await waitFor(() => expect(calledWith("session_publish_state", {
      isPlaying: true,
      mediaId: "i1",
      position: 42,
      rate: 1,
    })).toBe(true));
  });

  it("samples sync on a host anchor and applies the rate correction", async () => {
    mockInvoke((command) => {
      if (command === "session_status") return GUEST_STATUS;
      if (command === "session_sync_sample") return RATE_SAMPLE;
      return undefined;
    });
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.role).toBe("guest"));

    const playback = tauri.calls.find((call) => call.event === "session-playback");
    await act(async () => {
      playback?.handler({ payload: {} });
    });

    await waitFor(() =>
      expect(calledWith("session_sync_sample", { mediaId: "i1", timePos: 42 })).toBe(true)
    );
    await waitFor(() =>
      expect(
        calledWith("player_set_property", { name: "speed", value: 1.05 })
      ).toBe(true)
    );
    expect(result.current.sample?.instruction).toEqual({
      kind: "setRate",
      rate: 1.05,
    });
  });

  it("applies a host command once and ignores a stale revision", async () => {
    mockInvoke((command) => (command === "session_status" ? GUEST_STATUS : undefined));
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.role).toBe("guest"));

    const command = tauri.calls.find((call) => call.event === "session-command");
    await act(async () => {
      command?.handler({ payload: { action: { a: "pause" }, revision: 3 } });
    });
    await waitFor(() =>
      expect(calledWith("player_set_property", { name: "pause", value: true })).toBe(true)
    );

    invokeMock.mockClear();
    await act(async () => {
      command?.handler({ payload: { action: { a: "play" }, revision: 2 } });
    });
    expect(
      calledWith("player_set_property", { name: "pause", value: false })
    ).toBe(false);
  });

  it("stores the guest release offset", async () => {
    mockInvoke((command) => {
      if (command === "session_status") return GUEST_STATUS;
      if (command === "session_set_offset") return -750;
      return undefined;
    });
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.role).toBe("guest"));

    act(() => result.current.setOffsetMs(-750));

    await waitFor(() =>
      expect(calledWith("session_set_offset", { offsetMs: -750 })).toBe(true)
    );
  });

  it("pauses a guest while the host is away and resumes when it returns", async () => {
    const away = { ...GUEST_STATUS, hostOnline: false };
    mockInvoke((command) => {
      if (command === "session_status") return away;
      if (command === "session_sync_sample") return RATE_SAMPLE;
      return undefined;
    });
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.hostLost).toBe(true));
    expect(calledWith("player_set_property", { name: "pause", value: true })).toBe(true);

    invokeMock.mockClear();
    mockInvoke((command) => {
      if (command === "session_status") return GUEST_STATUS;
      if (command === "session_sync_sample") return RATE_SAMPLE;
      return undefined;
    });
    act(() =>
      client.setQueryData(SESSION_STATUS_QUERY_KEY, GUEST_STATUS)
    );

    await waitFor(() => expect(result.current.hostLost).toBe(false));
    await waitFor(() =>
      expect(calledWith("player_set_property", { name: "pause", value: false })).toBe(true)
    );
  });

  it("leaves the room and unpauses when the guest continues alone", async () => {
    mockInvoke((command) => {
      if (command === "session_status") return { ...GUEST_STATUS, hostOnline: false };
      if (command === "session_sync_sample") return RATE_SAMPLE;
      return undefined;
    });
    const { result } = renderHook(() => useSessionPlayer(), { wrapper });

    await waitFor(() => expect(result.current.hostLost).toBe(true));

    invokeMock.mockClear();
    act(() => result.current.resumeAlone());

    await waitFor(() => expect(called("session_leave")).toBe(true));
    await waitFor(() =>
      expect(calledWith("player_set_property", { name: "pause", value: false })).toBe(true)
    );
  });
});
