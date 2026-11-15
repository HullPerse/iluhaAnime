import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePrepareCardsPacks } from "@/hooks/cards/prepare.hook";
import { cardsApi } from "@/api/cards.api";

vi.mock("@/hooks/network.hook", () => ({ useOnlineStatus: () => true }));

describe("background pack preparation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a failed preparation and cancels retries on unmount", async () => {
    const prepare = vi
      .spyOn(cardsApi, "preparePacks")
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    const { unmount } = renderHook(() => usePrepareCardsPacks(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});
