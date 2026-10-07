import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useDebouncedCallback,
  useDebouncedValue,
  useThrottledCallback,
  useThrottledValue,
} from "@/hooks/pacer.hook";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useDebouncedValue", () => {
  function renderValue(initial: string) {
    return renderHook(({ value }: { value: string }) => useDebouncedValue(value, { wait: 300 }), {
      initialProps: { value: initial },
    });
  }

  it("holds the previous value until the wait elapses", () => {
    const { result, rerender } = renderValue("a");
    expect(result.current[0]).toBe("a");
    expect(result.current[1].isPending).toBe(true);
    rerender({ value: "b" });
    expect(result.current[0]).toBe("a");
    expect(result.current[1].isPending).toBe(true);
    advance(299);
    expect(result.current[0]).toBe("a");
    advance(1);
    expect(result.current[0]).toBe("b");
    expect(result.current[1].isPending).toBe(false);
    expect(result.current[1].executionCount).toBe(1);
  });

  it("cancels and flushes through the returned controls", () => {
    const { result, rerender } = renderValue("a");
    rerender({ value: "b" });
    act(() => {
      result.current[1].cancel();
    });
    advance(500);
    expect(result.current[0]).toBe("a");
    rerender({ value: "c" });
    act(() => {
      result.current[1].flush();
    });
    expect(result.current[0]).toBe("c");
  });

  it("arms the trailing window on mount without committing a change", () => {
    const { result } = renderValue("a");
    expect(result.current[0]).toBe("a");
    expect(result.current[1].isPending).toBe(true);
    advance(500);
    expect(result.current[0]).toBe("a");
    expect(result.current[1].isPending).toBe(false);
  });

  it("skips rescheduling for values the equal comparator accepts", () => {
    const first = { q: "x" };
    const { result, rerender } = renderHook(
      ({ value }: { value: { q: string } }) =>
        useDebouncedValue(value, { equal: (a, b) => a.q === b.q, wait: 300 }),
      { initialProps: { value: first } }
    );
    advance(500);
    rerender({ value: { q: "x" } });
    expect(result.current[1].isPending).toBe(false);
    advance(500);
    expect(result.current[0]).toBe(first);
  });

  it("passes values through immediately while disabled", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, { enabled: false, wait: 300 }),
      { initialProps: { value: "a" } }
    );
    rerender({ value: "b" });
    expect(result.current[0]).toBe("b");
    expect(result.current[1].isPending).toBe(false);
    expect(result.current[1].status).toBe("disabled");
  });

  it("cancels pending work on unmount", () => {
    const { result, rerender, unmount } = renderValue("a");
    rerender({ value: "b" });
    unmount();
    advance(500);
    expect(result.current[1].executionCount).toBe(0);
  });
});

describe("useDebouncedCallback", () => {
  it("keeps a stable identity and runs the latest call", () => {
    const task = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, { wait: 200 }), {
      initialProps: { fn: task },
    });
    const first = result.current;
    rerender({ fn: task });
    expect(result.current).toBe(first);
    act(() => {
      result.current("a");
    });
    act(() => {
      result.current("b");
    });
    expect(task).not.toHaveBeenCalled();
    advance(200);
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("b");
    act(() => {
      result.current("c");
    });
    act(() => {
      result.current.flush();
    });
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith("c");
  });

  it("invokes the latest closure and supports cancel", () => {
    let seen = "";
    const seenTask = (value: string) => {
      seen = value;
    };
    const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, { wait: 200 }), {
      initialProps: { fn: seenTask },
    });
    rerender({
      fn: (value: string) => {
        seen = value;
      },
    });
    act(() => {
      result.current("z");
    });
    advance(200);
    expect(seen).toBe("z");
    act(() => {
      result.current("y");
      result.current.cancel();
    });
    advance(500);
    expect(seen).toBe("z");
  });
});

describe("useThrottledValue", () => {
  it("passes values through immediately while disabled", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useThrottledValue(value, { enabled: false, wait: 300 }),
      { initialProps: { value: "a" } }
    );
    rerender({ value: "b" });
    expect(result.current[0]).toBe("b");
    expect(result.current[1].isPending).toBe(false);
    expect(result.current[1].status).toBe("disabled");
  });

  it("applies the leading change at once and coalesces the rest", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useThrottledValue(value, { wait: 300 }),
      { initialProps: { value: "a" } }
    );
    rerender({ value: "b" });
    expect(result.current[0]).toBe("b");
    rerender({ value: "c" });
    rerender({ value: "d" });
    expect(result.current[0]).toBe("b");
    advance(300);
    expect(result.current[0]).toBe("d");
  });
});

describe("useThrottledCallback", () => {
  it("leads immediately and trails once per window", () => {
    const task = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(task, { wait: 300 }));
    act(() => {
      result.current("a");
    });
    expect(task).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith("a");
    act(() => {
      result.current("b");
    });
    expect(task).toHaveBeenCalledTimes(1);
    advance(300);
    expect(task).toHaveBeenCalledTimes(2);
    expect(task).toHaveBeenLastCalledWith("b");
    act(() => {
      result.current("c");
    });
    act(() => {
      result.current.flush();
    });
    expect(task).toHaveBeenCalledTimes(3);
    expect(task).toHaveBeenLastCalledWith("c");
  });

  it("cancels pending trailing work", () => {
    const task = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(task, { wait: 300 }));
    act(() => {
      result.current("a");
      result.current("b");
      result.current.cancel();
    });
    advance(500);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
