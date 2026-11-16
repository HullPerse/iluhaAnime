import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cardsApi } from "@/api/cards.api";
import { usePrepareCardsPacks } from "@/hooks/cards/prepare.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";

vi.mock("@/hooks/network.hook", () => ({ useOnlineStatus: () => true }));

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

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
    const { unmount } = renderHook(() => usePrepareCardsPacks(true), {
      wrapper: wrapperFor(makeClient()),
    });
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

  it("invalidates the album caches after repairing studio collages", async () => {
    vi.spyOn(cardsApi, "preparePacks").mockResolvedValue({
      prepared: 0,
      failed: 0,
      repaired: 1,
      unnotified: 0,
    });
    const client = makeClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { unmount } = renderHook(() => usePrepareCardsPacks(true), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cardsCollectionScope() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.cardsCollectionsScope() });
    unmount();
  });
});
