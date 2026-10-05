import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  SESSION_TYPING_EVENT,
  TYPING_KEEPALIVE_MS,
  TYPING_TTL_MS,
} from "@/config/lobby/common.config";
import { useChatTyping, useTypingSender } from "@/hooks/session/typing.hook";
import type { PeerInfo } from "@/types/session";

function emit(event: string, payload: unknown): void {
  const call = tauri.calls.find((entry) => entry.event === event);
  if (!call) throw new Error(`no listener registered for ${event}`);
  call.handler({ payload });
}

async function waitForListener(event: string): Promise<void> {
  await waitFor(() =>
    expect(tauri.calls.some((call) => call.event === event)).toBe(true)
  );
}

function peer(peerId: string, displayName: string): PeerInfo {
  return {
    peerId,
    displayName,
    avatarSeed: peerId,
    anilistUserId: null,
    role: "viewer",
    connection: "direct",
    ready: true,
    driftMs: 0,
    rttMs: 0,
    buffering: false,
    left: false,
    endpointId: `end-${peerId}`,
  };
}

function typingCalls(): Array<Record<string, unknown> | undefined> {
  return invokeMock.mock.calls
    .filter(([name]) => name === "session_typing")
    .map(([, args]) => args);
}

/**
 * Let a fire-and-forget command settle: the transport dedupes identical
 * in-flight calls, so a second same-key send only reaches `invoke` after the
 * first promise's cleanup microtask has run.
 */
function flushCommand(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

beforeEach(() => {
  tauri.reset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  resetTransportInflight();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChatTyping", () => {
  it("shows a peer's name while it types and drops it on the stop frame", async () => {
    const { result } = renderHook(() => useChatTyping([peer("p1", "Alice")]));

    expect(result.current).toEqual([]);
    await waitForListener(SESSION_TYPING_EVENT);
    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: true }));
    expect(result.current).toEqual(["Alice"]);

    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: false }));
    expect(result.current).toEqual([]);
  });

  it("fades a silent peer out once its TTL lapses", async () => {
    const { result } = renderHook(() => useChatTyping([peer("p1", "Alice")]));
    await waitForListener(SESSION_TYPING_EVENT);

    vi.useFakeTimers();
    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: true }));
    expect(result.current).toEqual(["Alice"]);

    act(() => vi.advanceTimersByTime(TYPING_TTL_MS - 1));
    expect(result.current).toEqual(["Alice"]);

    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toEqual([]);
  });

  it("re-arms the TTL on repeat frames so a burst stays visible", async () => {
    const { result } = renderHook(() => useChatTyping([peer("p1", "Alice")]));
    await waitForListener(SESSION_TYPING_EVENT);

    vi.useFakeTimers();
    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: true }));
    act(() => vi.advanceTimersByTime(TYPING_TTL_MS - 1));
    // The keep-alive frame lands just before expiry and restarts the clock.
    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: true }));
    act(() => vi.advanceTimersByTime(TYPING_TTL_MS - 1));
    expect(result.current).toEqual(["Alice"]);

    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toEqual([]);
  });

  it("maps every typing peer to its display name", async () => {
    const { result } = renderHook(() =>
      useChatTyping([peer("p1", "Alice"), peer("p2", "Bob")])
    );
    await waitForListener(SESSION_TYPING_EVENT);

    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: true }));
    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p2", active: true }));
    expect(result.current).toEqual(["Alice", "Bob"]);

    act(() => emit(SESSION_TYPING_EVENT, { peerId: "p1", active: false }));
    expect(result.current).toEqual(["Bob"]);
  });

  it("renders nothing for a peer outside the roster", async () => {
    const { result } = renderHook(() => useChatTyping([peer("p1", "Alice")]));
    await waitForListener(SESSION_TYPING_EVENT);

    act(() => emit(SESSION_TYPING_EVENT, { peerId: "ghost", active: true }));
    expect(result.current).toEqual([]);
  });
});

describe("useTypingSender", () => {
  it("sends one leading-edge frame for the first keystrokes of a burst", () => {
    const { result } = renderHook(() => useTypingSender());

    act(() => result.current.noteTyping());
    expect(typingCalls()).toEqual([{ active: true }]);

    // Inside the keep-alive window the frame is silent.
    act(() => result.current.noteTyping());
    expect(typingCalls()).toEqual([{ active: true }]);
  });

  it("re-sends once the keep-alive window elapses", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const { result } = renderHook(() => useTypingSender());

    act(() => result.current.noteTyping());
    await flushCommand();
    nowSpy.mockReturnValue(1_000 + TYPING_KEEPALIVE_MS + 1);
    act(() => result.current.noteTyping());
    expect(typingCalls()).toEqual([{ active: true }, { active: true }]);
  });

  it("sends a single stop frame only after a burst started", () => {
    const { result } = renderHook(() => useTypingSender());

    // Nothing typed yet: a stray stop frame would be noise.
    act(() => result.current.noteStopped());
    expect(typingCalls()).toEqual([]);

    act(() => result.current.noteTyping());
    act(() => result.current.noteStopped());
    act(() => result.current.noteStopped());
    expect(typingCalls()).toEqual([{ active: true }, { active: false }]);
  });

  it("sends a fresh leading edge after a stop", async () => {
    const { result } = renderHook(() => useTypingSender());

    act(() => result.current.noteTyping());
    await flushCommand();
    act(() => result.current.noteStopped());
    await flushCommand();
    act(() => result.current.noteTyping());
    expect(typingCalls()).toEqual([
      { active: true },
      { active: false },
      { active: true },
    ]);
  });
});
