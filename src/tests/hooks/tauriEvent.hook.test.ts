import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Unlisten = () => Promise<void>;
type TauriEvent = { payload: unknown };

const tauri = vi.hoisted(() => {
  interface Call {
    event: string;
    handler: (event: TauriEvent) => void;
    unlisten: Unlisten;
    unlistenCount: number;
    resolve: () => void;
    reject: (error: unknown) => void;
  }
  const calls: Call[] = [];

  const listen = (event: string, handler: (event: TauriEvent) => void): Promise<Unlisten> => {
    let resolveFn: (() => void) | undefined;
    let rejectFn: ((error: unknown) => void) | undefined;
    const call: Call = {
      event,
      handler,
      unlisten: async () => {
        call.unlistenCount += 1;
      },
      unlistenCount: 0,
      resolve: () => resolveFn?.(),
      reject: (error: unknown) => rejectFn?.(error),
    };
    const promise = new Promise<Unlisten>((resolve, reject) => {
      resolveFn = () => resolve(call.unlisten);
      rejectFn = (error: unknown) => reject(error);
    });
    calls.push(call);
    return promise;
  };

  const last = (): Call | undefined => calls.at(-1);
  const reset = (): void => {
    calls.length = 0;
  };

  return { listen, calls, last, reset };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: TauriEvent) => void): Promise<Unlisten> =>
    tauri.listen(event, handler),
}));

import { useTauriEvent } from "@/hooks/tauriEvent.hook";

beforeEach(() => {
  tauri.reset();
});

describe("useTauriEvent", () => {
  it("subscribes on mount and delivers payloads to the handler", async () => {
    const handler = vi.fn();
    renderHook(() => useTauriEvent("basic-event", handler));
    const call = tauri.last();
    expect(tauri.calls).toHaveLength(1);
    expect(call?.event).toBe("basic-event");
    await act(async () => {
      call?.resolve();
    });
    act(() => {
      call?.handler({ payload: "hello" });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ payload: "hello" });
  });

  it("unlistens on unmount", async () => {
    const { unmount } = renderHook(() => useTauriEvent("mount-event", () => {}));
    const call = tauri.last();
    await act(async () => {
      call?.resolve();
    });
    await act(async () => {
      unmount();
    });
    expect(call?.unlistenCount).toBe(1);
  });

  it("does not subscribe while disabled and re-subscribes when re-enabled", async () => {
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => useTauriEvent("toggle-event", () => {}, { enabled: on }),
      { initialProps: { on: false } }
    );
    expect(tauri.calls).toHaveLength(0);
    rerender({ on: true });
    const call = tauri.last();
    expect(tauri.calls).toHaveLength(1);
    expect(call?.event).toBe("toggle-event");
    await act(async () => {
      call?.resolve();
    });
    rerender({ on: false });
    expect(call?.unlistenCount).toBe(1);
    rerender({ on: true });
    expect(tauri.calls).toHaveLength(2);
  });

  it("re-subscribes when the error tag changes and unlistens the previous listener", async () => {
    const { rerender } = renderHook(
      ({ tag }: { tag?: string }) => useTauriEvent("tag-change-event", () => {}, { errorTag: tag }),
      { initialProps: { tag: "a" } }
    );
    const first = tauri.calls[0];
    await act(async () => {
      first.resolve();
    });
    rerender({ tag: "b" });
    expect(tauri.calls).toHaveLength(2);
    expect(first.unlistenCount).toBe(1);
  });

  it("delivers events to the latest handler without re-subscribing", async () => {
    const firstHandler = vi.fn((event: { payload: string }) => event.payload);
    const secondHandler = vi.fn((event: { payload: string }) => event.payload);
    const { rerender } = renderHook(
      ({ fn }: { fn: (event: { payload: string }) => void }) => useTauriEvent("latest-event", fn),
      { initialProps: { fn: firstHandler } }
    );
    const call = tauri.last();
    await act(async () => {
      call?.resolve();
    });
    rerender({ fn: secondHandler });
    expect(tauri.calls).toHaveLength(1);
    act(() => {
      call?.handler({ payload: "x" });
    });
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith({ payload: "x" });
  });

  it("reports listen failures with the configured error tag", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useTauriEvent("tagged-event", () => {}, { errorTag: "my.tag" }));
    const call = tauri.last();
    await act(async () => {
      call?.reject(new Error("ipc down"));
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "background task failed: my.tag.listen",
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it("falls back to the event name when no error tag is provided", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useTauriEvent("untagged-event", () => {}));
    const call = tauri.last();
    await act(async () => {
      call?.reject(new Error("ipc down"));
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "background task failed: untagged-event.listen",
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it("unlistens a listener that resolves after unmount (no leak)", async () => {
    const { unmount } = renderHook(() => useTauriEvent("leaky-event", () => {}));
    const call = tauri.last();
    await act(async () => {
      unmount();
    });
    await act(async () => {
      call?.resolve();
    });
    expect(call?.unlistenCount).toBe(1);
  });
});
