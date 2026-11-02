import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROXY_TEST_SLOW_MS, useProxyTest } from "@/hooks/proxyTest.hook";

describe("useProxyTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a slow check running and flags it red after the threshold", async () => {
    const { result } = renderHook(() => useProxyTest());
    let resolveTest: (value: string) => void = () => {};
    const check = new Promise<string>((resolve) => {
      resolveTest = resolve;
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.run(() => check);
    });
    expect(result.current.running).toBe(true);
    expect(result.current.slow).toBe(false);

    act(() => {
      vi.advanceTimersByTime(PROXY_TEST_SLOW_MS - 1);
    });
    expect(result.current.running).toBe(true);
    expect(result.current.slow).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.running).toBe(true);
    expect(result.current.slow).toBe(true);

    await act(async () => {
      resolveTest("ok");
      await pending;
    });
    expect(result.current.state).toEqual({ kind: "ok", message: "ok" });
    expect(result.current.running).toBe(false);
    expect(result.current.slow).toBe(false);
  });
});
