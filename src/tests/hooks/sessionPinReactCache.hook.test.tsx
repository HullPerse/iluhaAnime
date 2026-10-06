import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
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

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: TauriEvent) => void) =>
    tauri.listen(event, handler),
}));

import { resetTransportInflight } from "@/api/transport.api";
import { SESSION_PIN_EVENT, SESSION_REACT_EVENT } from "@/config/lobby/common.config";
import { useChatPinReactions } from "@/hooks/session/pin-react.hook";
import { SESSION_STATUS_QUERY_KEY } from "@/hooks/session/queries.hook";
import { useSettingsStore } from "@/store/settings.store";
import type { SessionPin, SessionReaction, SessionStatus } from "@/types/session";

const STATUS: SessionStatus = {
  addrs: [],
  chat: [
    { at: 1_700_000_000, attachment: null, from: "Alice", id: "m1", links: [], replyTo: null, text: "hello" },
  ],
  hostOnline: true,
  lobbyRole: "viewer",
  missing: {},
  paths: {},
  peers: [],
  plan: [],
  pinned: null,
  reactions: [{ emoji: "👍", messageId: "m1", peers: ["p1"] }],
  ready: { allReady: true, peers: [] },
  role: "guest",
  sessionId: "a1b2c3d4e5f60718",
  ticket: null,
  waiting: null,
  yourPeerId: "p2",
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function emit(name: string, payload: SessionPin | SessionReaction) {
  const handler = tauri.calls.find((call) => call.event === name)?.handler;
  expect(handler).toBeTruthy();
  await act(async () => {
    handler?.({ payload });
  });
}

function status(): SessionStatus | undefined {
  return client.getQueryData<SessionStatus>(SESSION_STATUS_QUERY_KEY);
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  tauri.reset();
  resetTransportInflight();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe("useChatPinReactions", () => {
  it("subscribes to the session-pin and session-react frames", () => {
    renderHook(() => useChatPinReactions(), { wrapper });

    const names = tauri.calls.map((call) => call.event);
    expect(names).toContain(SESSION_PIN_EVENT);
    expect(names).toContain(SESSION_REACT_EVENT);
  });

  it("sets the cached pinned anchor from a pin frame", async () => {
    client.setQueryData(SESSION_STATUS_QUERY_KEY, STATUS);
    renderHook(() => useChatPinReactions(), { wrapper });

    await emit(SESSION_PIN_EVENT, { messageId: "m1", pinnedBy: "p2" });

    expect(status()?.pinned).toEqual({ messageId: "m1", pinnedBy: "p2" });
    // Untouched fields survive the glue update.
    expect(status()?.chat).toEqual(STATUS.chat);
  });

  it("clears the anchor when the pin frame carries a null message", async () => {
    client.setQueryData(SESSION_STATUS_QUERY_KEY, {
      ...STATUS,
      pinned: { messageId: "m1", pinnedBy: "p2" },
    });
    renderHook(() => useChatPinReactions(), { wrapper });

    await emit(SESSION_PIN_EVENT, { messageId: null, pinnedBy: "p2" });

    expect(status()?.pinned).toBeNull();
  });

  it("joins a peer to a cached reaction entry", async () => {
    client.setQueryData(SESSION_STATUS_QUERY_KEY, STATUS);
    renderHook(() => useChatPinReactions(), { wrapper });

    await emit(SESSION_REACT_EVENT, {
      add: true,
      emoji: "👍",
      messageId: "m1",
      peerId: "p3",
    });

    expect(status()?.reactions).toEqual([
      { emoji: "👍", messageId: "m1", peers: ["p1", "p3"] },
    ]);
  });

  it("prunes a cached entry when its last peer leaves", async () => {
    client.setQueryData(SESSION_STATUS_QUERY_KEY, STATUS);
    renderHook(() => useChatPinReactions(), { wrapper });

    await emit(SESSION_REACT_EVENT, {
      add: false,
      emoji: "👍",
      messageId: "m1",
      peerId: "p1",
    });

    expect(status()?.reactions).toEqual([]);
  });

  it("skips frames that arrive before the cache holds a status", async () => {
    renderHook(() => useChatPinReactions(), { wrapper });

    await emit(SESSION_PIN_EVENT, { messageId: "m1", pinnedBy: "p2" });
    await emit(SESSION_REACT_EVENT, {
      add: true,
      emoji: "👍",
      messageId: "m1",
      peerId: "p3",
    });

    // No status snapshot yet: the next poll replays the state.
    expect(client.getQueryData(SESSION_STATUS_QUERY_KEY)).toBeUndefined();
  });
});
