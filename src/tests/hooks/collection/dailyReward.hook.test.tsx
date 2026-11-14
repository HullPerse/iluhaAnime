import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDailyRewardNotice } from "@/hooks/daily/reward.hook";
import { showInfo } from "@/lib/core/ui/notification.utils";
import type { DailyResultView } from "@/types/api/daily";

vi.mock("@/lib/core/ui/notification.utils", () => ({
  showInfo: vi.fn(),
}));

const t = ((key: string) => key) as Parameters<typeof useDailyRewardNotice>[1];

function result(rewardPackId: string | null = "daily-2026-11-14-frames"): DailyResultView {
  return {
    won: true,
    attempts: 2,
    rewardPackId,
    answer: {
      mediaId: 1,
      title: "Test anime",
      year: 2020,
      format: "TV",
      episodes: 12,
      genres: [],
      studio: null,
      score: null,
      source: null,
    },
  };
}

beforeEach(() => {
  vi.mocked(showInfo).mockClear();
});

describe("useDailyRewardNotice", () => {
  it("stays silent for a result that was already on screen", () => {
    renderHook(() => useDailyRewardNotice(result(), t));
    expect(showInfo).not.toHaveBeenCalled();
  });

  it("notifies once when a fresh reward appears", () => {
    const { rerender } = renderHook(
      ({ daily }: { daily: DailyResultView | null }) => useDailyRewardNotice(daily, t),
      { initialProps: { daily: null as DailyResultView | null } }
    );

    rerender({ daily: result() });
    expect(showInfo).toHaveBeenCalledTimes(1);
    expect(showInfo).toHaveBeenCalledWith(
      "collection.game.rewardNotice.title",
      "collection.game.reward"
    );

    rerender({ daily: result() });
    expect(showInfo).toHaveBeenCalledTimes(1);
  });

  it("does not notify for a loss or a result without a pack", () => {
    const { rerender } = renderHook(
      ({ daily }: { daily: DailyResultView | null }) => useDailyRewardNotice(daily, t),
      { initialProps: { daily: null as DailyResultView | null } }
    );

    rerender({ daily: result(null) });
    expect(showInfo).not.toHaveBeenCalled();
  });

  it("notifies when a pack appears after a packless result", () => {
    const { rerender } = renderHook(
      ({ daily }: { daily: DailyResultView | null }) => useDailyRewardNotice(daily, t),
      { initialProps: { daily: null as DailyResultView | null } }
    );

    rerender({ daily: result(null) });
    rerender({ daily: result() });
    expect(showInfo).toHaveBeenCalledTimes(1);
  });
});
