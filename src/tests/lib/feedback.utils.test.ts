import { describe, expect, it } from "vitest";

import { feedbackScore } from "@/lib/core/feedback.utils";
import { suggestionPoolSize } from "@/lib/core/rank.utils";
import { RANKING } from "@/config/anilist/ranking.config";

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

function counters(overrides: Partial<Parameters<typeof feedbackScore>[0]> = {}) {
  return { ignoredCount: 0, lastUsedAt: NOW, selectedCount: 0, useCount: 0, ...overrides };
}

describe("ranking/feedback", () => {
  it("returns zero without counters", () => {
    expect(feedbackScore(undefined, NOW)).toBe(0);
    expect(feedbackScore(null, NOW)).toBe(0);
    expect(feedbackScore(counters(), NOW)).toBe(0);
  });

  it("adds capped selection and use, subtracts capped ignores", () => {
    expect(feedbackScore(counters({ selectedCount: 2 }), NOW)).toBe(40);
    expect(feedbackScore(counters({ useCount: 3 }), NOW)).toBe(12);
    expect(feedbackScore(counters({ ignoredCount: 2 }), NOW)).toBe(-16);
    expect(feedbackScore(counters({ useCount: 999 }), NOW)).toBe(RANKING.FEEDBACK_USE_CAP);
    expect(feedbackScore(counters({ selectedCount: 999 }), NOW)).toBe(
      RANKING.FEEDBACK_SELECTED_CAP
    );
    expect(feedbackScore(counters({ ignoredCount: 999 }), NOW)).toBe(-RANKING.FEEDBACK_IGNORED_CAP);
  });

  it("decays positive feedback by half every halflife", () => {
    const fresh = feedbackScore(counters({ selectedCount: 2 }), NOW);
    const halfLife = feedbackScore(
      counters({ selectedCount: 2 }),
      NOW + RANKING.FEEDBACK_HALFLIFE_HOURS * HOUR
    );
    expect(halfLife).toBeCloseTo(fresh / 2, 5);
    expect(
      feedbackScore(
        counters({ selectedCount: 2 }),
        NOW + 10 * RANKING.FEEDBACK_HALFLIFE_HOURS * HOUR
      )
    ).toBeLessThan(1);
  });

  it("lets a stale ignore fade instead of punishing forever", () => {
    const stale = feedbackScore(
      counters({ ignoredCount: 5 }),
      NOW + 10 * RANKING.FEEDBACK_HALFLIFE_HOURS * HOUR
    );
    expect(stale).toBeGreaterThan(-1);
    expect(stale).toBeLessThan(0);
  });
});

describe("ranking/pool", () => {
  it("widens the recall pool without exceeding the backend cap", () => {
    expect(suggestionPoolSize(1)).toBe(RANKING.POOL_MIN);
    expect(suggestionPoolSize(8)).toBe(48);
    expect(suggestionPoolSize(50)).toBe(RANKING.POOL_MAX);
  });
});
