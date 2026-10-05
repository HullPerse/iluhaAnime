import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import { SESSION_STATUS_QUERY_KEY } from "@/hooks/session/queries.hook";
import { useSessionHandoverBridge } from "@/hooks/session/handover.hook";
import { useNotificationStore } from "@/store/notification.store";
import { useSessionStore } from "@/store/session.store";
import { useSettingsStore } from "@/store/settings.store";

let client: QueryClient;

function emit(event: string, payload: unknown): void {
  const call = tauri.calls.find((entry) => entry.event === event);
  if (!call) throw new Error(`no listener registered for ${event}`);
  call.handler({ payload });
}

function renderBridge(role: "host" | "guest") {
  return renderHook(() => useSessionHandoverBridge(role), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  tauri.reset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  useSettingsStore.setState({ language: "en" });
  useSessionStore.setState({ planPaths: {} });
  useNotificationStore.setState({ items: [] });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("useSessionHandoverBridge", () => {
  it("takes the room over with the local paths when chosen", async () => {
    useSessionStore.setState({ planPaths: { i1: "D:/anime/mine.mkv" } });
    renderBridge("guest");

    await waitFor(() =>
      expect(
        tauri.calls.some((call) => call.event === "session-host-handover")
      ).toBe(true)
    );
    act(() => emit("session-host-handover", null));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("session_accept_handover", {
        paths: { i1: "D:/anime/mine.mkv" },
      })
    );
  });

  it("ignores the handover as the host", () => {
    renderBridge("host");

    expect(
      tauri.calls.some((call) => call.event === "session-host-handover")
    ).toBe(false);
    expect(tauri.calls.some((call) => call.event === "session-migrate")).toBe(
      false
    );
  });

  it("surfaces a failed takeover as an error notification", async () => {
    invokeMock.mockRejectedValue(new Error("no handover pending"));
    renderBridge("guest");

    await waitFor(() =>
      expect(
        tauri.calls.some((call) => call.event === "session-host-handover")
      ).toBe(true)
    );
    act(() => emit("session-host-handover", null));

    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .items.some((item) => item.message === "no handover pending")
      ).toBe(true)
    );
  });

  it("refreshes the polled status when the room migrates", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderBridge("guest");

    await waitFor(() =>
      expect(tauri.calls.some((call) => call.event === "session-migrate")).toBe(
        true
      )
    );
    act(() => emit("session-migrate", "p9"));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: SESSION_STATUS_QUERY_KEY,
      })
    );
  });
});
