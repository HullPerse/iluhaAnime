import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dailyApi } from "@/api/daily.api";
import {
  useGuessDailyGame,
  useGuessDailyOp,
  usePrepareDailyGame,
  useWarmDailyOp,
} from "@/hooks/daily/queries.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { patchSettings } from "@/store/settings.store";
import type {
  DailyAnswer,
  DailyFramesView,
  DailyGuessView,
  DailyOpGuessView,
} from "@/types/api/daily";

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

const ANSWER: DailyAnswer = {
  mediaId: 1,
  title: "Test anime",
  year: 2020,
  format: "TV",
  episodes: 12,
  genres: [],
  studio: null,
  score: null,
  source: null,
};

function guessView(rewardPackId: string | null): DailyGuessView {
  return {
    correct: rewardPackId !== null,
    sameFranchise: false,
    attempts: 2,
    maxAttempts: 6,
    revealed: 2,
    finished: true,
    frame: null,
    result: {
      won: rewardPackId !== null,
      attempts: 2,
      rewardPackId,
      answer: ANSWER,
    },
  };
}

function opGuessView(rewardPackId: string | null): DailyOpGuessView {
  return {
    correct: rewardPackId !== null,
    sameFranchise: false,
    finished: true,
    state: {
      day: DAY,
      mode: "op",
      attempts: 2,
      maxAttempts: 6,
      revealed: 2,
      clipPath: "",
      fullPath: "",
      startFraction: 0,
      themeType: "",
      hints: [],
      result: {
        won: rewardPackId !== null,
        attempts: 2,
        rewardPackId,
        answer: ANSWER,
      },
    },
  };
}

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
  it("uses the opening proxy separately from the frames proxy", async () => {
    patchSettings({
      anilistProxyUrl: null,
      dailyProxyUrl: ANILIST_PROXY,
      dailyOpeningProxyUrl: DAILY_PROXY,
    });
    const prepare = vi.spyOn(dailyApi, "prepareOp").mockResolvedValue({} as never);
    const { result } = renderHook(() => useWarmDailyOp(DAY), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(prepare).toHaveBeenCalledWith(DAY, DAILY_PROXY);
  });

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

describe("daily reward cache", () => {
  const PACKS_KEY = queryKeys.cardsPacks("");
  const UNREAD_KEY = queryKeys.cardsUnread(0, 0);

  const seedCardsCache = () => {
    client.setQueryData(PACKS_KEY, []);
    client.setQueryData(UNREAD_KEY, { packs: 0, cards: 0 });
  };

  const expectInvalidated = (invalidated: boolean) => {
    expect(client.getQueryState(PACKS_KEY)?.isInvalidated).toBe(invalidated);
    expect(client.getQueryState(UNREAD_KEY)?.isInvalidated).toBe(invalidated);
  };

  it("invalidates the packs and unread caches after a frames win", async () => {
    vi.spyOn(dailyApi, "guess").mockResolvedValue(guessView("daily-2026-11-15-frames"));
    seedCardsCache();
    const { result } = renderHook(() => useGuessDailyGame(DAY), { wrapper });

    act(() => result.current.mutate({ mode: "frames", mediaId: 1 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectInvalidated(true);
  });

  it("invalidates the packs caches after an opening win", async () => {
    vi.spyOn(dailyApi, "guessOp").mockResolvedValue(opGuessView("daily-2026-11-15-op"));
    seedCardsCache();
    const { result } = renderHook(() => useGuessDailyOp(DAY), { wrapper });

    act(() => result.current.mutate({ mediaId: 1 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectInvalidated(true);
  });

  it("keeps the packs cache when the finished round awarded nothing", async () => {
    vi.spyOn(dailyApi, "guess").mockResolvedValue(guessView(null));
    seedCardsCache();
    const { result } = renderHook(() => useGuessDailyGame(DAY), { wrapper });

    act(() => result.current.mutate({ mode: "frames", mediaId: 1 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectInvalidated(false);
  });
});
