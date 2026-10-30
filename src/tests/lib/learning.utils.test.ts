import { describe, expect, it } from "vitest";

import {
  applyLearningAction,
  buildLearningMaps,
  countersOf,
  dropLearningScope,
  learningStatKey,
} from "@/lib/learning.utils";
import { RANKING } from "@/config/ranking.config";
import type { LearningStatRow } from "@/types/search";

const NOW = 1_700_000_000_000;
const SECONDS = Math.floor(NOW / 1000);

function row(overrides: Partial<LearningStatRow> = {}): LearningStatRow {
  return {
    id: "history:anilist:frieren",
    ignoredCount: 0,
    kind: "history",
    lastUsedAt: SECONDS,
    scope: "anilist",
    selectedCount: 0,
    useCount: 1,
    value: "frieren",
    ...overrides,
  };
}

describe("ranking/learning", () => {
  it("converts SQLite seconds to milliseconds and keys history by scope", () => {
    const maps = buildLearningMaps([row({ useCount: 3, selectedCount: 2 })], NOW);
    const stat = maps.queryStats[learningStatKey("anilist", "frieren")];
    expect(stat).toEqual({ count: 3, ignoredCount: 0, lastUsedAt: NOW, selectedCount: 2 });
    expect(maps.suggestionStats.frieren?.selectedCount).toBe(2);
  });

  it("merges the same value across kinds for suggestion ranking", () => {
    const maps = buildLearningMaps(
      [
        row({ id: "anime:1", kind: "anime", useCount: 2, selectedCount: 1 }),
        row({ id: "anime:1:alias", kind: "anime_alias", useCount: 1 }),
      ],
      NOW
    );
    expect(maps.suggestionStats.frieren).toMatchObject({
      count: 3,
      selectedCount: 1,
    });
    expect(maps.queryStats).toEqual({});
  });

  it("drops rows older than the TTL", () => {
    const stale = Math.floor((NOW - RANKING.TTL_MS - 86_400_000) / 1000);
    const maps = buildLearningMaps([row({ lastUsedAt: stale })], NOW);
    expect(maps.queryStats).toEqual({});
    expect(maps.suggestionStats).toEqual({});
  });

  it("applies use, select and ignore deltas to a local projection", () => {
    let stats = applyLearningAction({}, "frieren", "use", NOW);
    stats = applyLearningAction(stats, "frieren", "select", NOW + 1);
    stats = applyLearningAction(stats, "frieren", "ignore", NOW + 2);
    expect(stats.frieren).toMatchObject({
      count: 1,
      ignoredCount: 1,
      selectedCount: 1,
      lastUsedAt: NOW + 2,
      lastIgnoredAt: NOW + 2,
    });
    expect(countersOf(stats.frieren!)).toEqual({
      ignoredCount: 1,
      lastUsedAt: NOW + 2,
      selectedCount: 1,
      useCount: 1,
    });
  });

  it("drops only the requested scope", () => {
    const stats = {
      [learningStatKey("anilist", "frieren")]: { count: 1, lastUsedAt: NOW, selectedCount: 0 },
      [learningStatKey("torrent", "frieren")]: { count: 1, lastUsedAt: NOW, selectedCount: 0 },
    };
    expect(Object.keys(dropLearningScope(stats, "anilist"))).toEqual(["torrent:frieren"]);
  });
});
