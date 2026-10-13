import { afterEach, describe, expect, it, vi } from "vitest";

import { createPinTimer, PIN_DESCRIPTION_MS } from "@/lib/hotkeys/pin.hotkeys";

describe("createPinTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the pin after three seconds", () => {
    expect(PIN_DESCRIPTION_MS).toBe(3000);
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const timer = createPinTimer(onExpire);
    timer.maybeExecute();
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("restarts the wait when re-armed", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const timer = createPinTimer(onExpire);
    timer.maybeExecute();
    vi.advanceTimersByTime(2500);
    timer.maybeExecute();
    vi.advanceTimersByTime(2500);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("drops the expiry when cancelled", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const timer = createPinTimer(onExpire);
    timer.maybeExecute();
    timer.cancel();
    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
