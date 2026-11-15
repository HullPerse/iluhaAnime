import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dailyApi } from "@/api/daily.api";
import { usePrepareDailyGame } from "@/hooks/daily/queries.hook";
import { patchSettings } from "@/store/settings.store";
import type { DailyFramesView } from "@/types/api/daily";

const DAY = "2026-11-15";
const ANILIST_PROXY = "socks5://127.0.0.1:10808";
const DAILY_PROXY = "http://127.0.0.1:7890";

const VIEW: DailyFramesView = {
  day: DAY,
  mode: "frames",
  attempts: 0,
  maxAttempts: 6,
  revealed: 1,
  frames: [{ slot: 0, dataUrl: "data:image/png;base64,AA", hintKind: "year", hintValue: "2013" }],
  result: null,
};

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("daily query proxy", () => {
  it("starts a round with the AniList proxy when the daily override is empty", async () => {
    patchSettings({ anilistProxyUrl: ANILIST_PROXY, dailyProxyUrl: null });
    const prepare = vi.spyOn(dailyApi, "prepare").mockResolvedValue(VIEW);
    const { result } = renderHook(() => usePrepareDailyGame(DAY), { wrapper });

    act(() => result.current.mutate("frames"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(prepare).toHaveBeenCalledWith(DAY, "frames", ANILIST_PROXY);
  });

  it("prefers the daily override over the AniList proxy", async () => {
    patchSettings({ anilistProxyUrl: ANILIST_PROXY, dailyProxyUrl: DAILY_PROXY });
    const prepare = vi.spyOn(dailyApi, "prepare").mockResolvedValue(VIEW);
    const { result } = renderHook(() => usePrepareDailyGame(DAY), { wrapper });

    act(() => result.current.mutate("frames"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(prepare).toHaveBeenCalledWith(DAY, "frames", DAILY_PROXY);
  });
});
