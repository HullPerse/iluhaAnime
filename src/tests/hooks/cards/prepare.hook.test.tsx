import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(listen).mockResolvedValue(vi.fn());
  });
  afterEach(() => {
    vi.mocked(listen).mockReset();
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

  it("reloads cached album pages when the native metadata refresh finishes", async () => {
    vi.spyOn(cardsApi, "preparePacks").mockResolvedValue({
      prepared: 0,
      failed: 0,
      repaired: 0,
      unnotified: 0,
    });
    const client = makeClient();
    const key = queryKeys.cardsCollection({}, "");
    client.setQueryData(key, []);
    const { unmount } = renderHook(() => usePrepareCardsPacks(true), {
      wrapper: wrapperFor(client),
    });
    const event = "cards-album-metadata-updated";
    const listener = vi.mocked(listen).mock.calls.find(([name]) => name === event)?.[1];
    expect(listener).toBeDefined();

    await act(async () => listener?.({ event, id: 1, payload: null }));

    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    unmount();
  });
});
