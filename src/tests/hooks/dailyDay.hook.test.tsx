import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDailyGameDay } from "@/hooks/daily/day.hook";

describe("useDailyGameDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls over at noon MSK without remounting the tab", () => {
    vi.setSystemTime(new Date("2026-11-14T08:59:58Z"));
    const { result } = renderHook(() => useDailyGameDay());

    expect(result.current).toBe("2026-11-13");

    act(() => {
      vi.advanceTimersByTime(2250);
    });

    expect(result.current).toBe("2026-11-14");
  });
});
