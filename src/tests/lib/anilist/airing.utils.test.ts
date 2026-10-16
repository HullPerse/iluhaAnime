import { describe, expect, it } from "vitest";

import {
  airingCountdownSecs,
  collectAiringRows,
  formatAiringCountdown,
  formatAiringLocal,
  formatAiringTime,
  groupAiringByDay,
} from "@/lib/anilist/airing.utils";
import { translate } from "@/lib/locale/i18n.utils";
import type { AniListCollection, AniListEntry, AniMedia } from "@/types/anilist";

const ru = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("ru", key, vars);

const en = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("en", key, vars);

describe("anilist/airing", () => {
  describe("airingCountdownSecs", () => {
    it.each([null, 0, -10, Number.NaN, Infinity])("returns null for airingAt %s", (airingAt) => {
      expect(airingCountdownSecs(airingAt, 1_700_000_000_000)).toBeNull();
    });

    it("returns null for a non-finite now", () => {
      expect(airingCountdownSecs(1_700_000_000, Number.NaN)).toBeNull();
    });

    it("returns rounded seconds until airing", () => {
      expect(airingCountdownSecs(1_700_000_000, (1_700_000_000 - 90) * 1000)).toBe(90);
    });

    it("clamps past airing to zero", () => {
      expect(airingCountdownSecs(1_700_000_000, 1_700_000_100_000)).toBe(0);
    });
  });

  describe("formatAiringCountdown", () => {
    it.each([[null], [0], [-5], [Number.NaN], [Infinity]] as const)(
      "returns empty for secs %s",
      (secs) => {
        expect(formatAiringCountdown(secs, en)).toBe("");
      }
    );

    it.each([
      { secs: 45, t: ru, expected: "45 сек" },
      { secs: 45, t: en, expected: "45 sec" },
      { secs: 125, t: ru, expected: "2 мин 5 сек" },
      { secs: 3661, t: ru, expected: "1 ч 1 мин" },
      { secs: 3661, t: en, expected: "1 h 1 min" },
      { secs: 86_399, t: en, expected: "23 h 59 min" },
    ])("delegates sub-day $secs to clock units as $expected", ({ secs, t, expected }) => {
      expect(formatAiringCountdown(secs, t)).toBe(expected);
    });

    it.each([
      { secs: 86_400, t: en, expected: "1 d" },
      { secs: 86_400, t: ru, expected: "1 д" },
      { secs: 90_000, t: en, expected: "1 d 1 h" },
      { secs: 90_000, t: ru, expected: "1 д 1 ч" },
      { secs: 180_000, t: en, expected: "2 d 2 h" },
      { secs: 259_200, t: ru, expected: "3 д" },
    ])("formats $secs as $expected", ({ secs, t, expected }) => {
      expect(formatAiringCountdown(secs, t)).toBe(expected);
    });
  });

  describe("formatAiringLocal", () => {
    it.each([[null], [0], [-5], [Number.NaN]] as const)(
      "returns null for airingAt %s",
      (airingAt) => {
        expect(formatAiringLocal(airingAt, "en")).toBeNull();
      }
    );

    it("includes the local time of day, not just the date", () => {
      const airingAt = 1_728_000_000;
      const result = formatAiringLocal(airingAt, "en");
      expect(typeof result).toBe("string");
      expect(result).not.toBe(new Date(airingAt * 1000).toLocaleDateString("en"));
    });
  });

  describe("formatAiringTime", () => {
    it.each([[null], [0], [Number.NaN]] as const)("returns null for airingAt %s", (airingAt) => {
      expect(formatAiringTime(airingAt, "ru")).toBeNull();
    });

    it("matches the local clock time", () => {
      const airingAt = 1_728_000_000;
      expect(formatAiringTime(airingAt, "ru")).toBe(
        new Date(airingAt * 1000).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
      );
    });
  });

  describe("collectAiringRows", () => {
    function makeMedia(overrides: Partial<AniMedia> = {}): AniMedia {
      return {
        cover_url: null,
        description: null,
        duration: 23,
        end_date: null,
        episodes: 24,
        favourites: null,
        format: "TV",
        genres: [],
        id: 1,
        next_airing_at: null,
        next_episode: null,
        popularity: null,
        rankings: [],
        relations: [],
        score: null,
        season: null,
        season_year: null,
        start_date: null,
        status: "RELEASING",
        studios: [],
        tags: [],
        title: "Show",
        titles: ["Show"],
        ...overrides,
      };
    }

    function makeEntry(
      id: number,
      airingAt: number | null,
      listStatus: string,
      episode: number | null = 3
    ): AniListEntry {
      return {
        completed_at: null,
        created_at: 0,
        custom_lists: [],
        list_status: listStatus,
        media: makeMedia({
          id,
          next_airing_at: airingAt,
          next_episode: episode,
          title: `Show ${id}`,
        }),
        notes: null,
        progress: 0,
        repeat: null,
        score: null,
        started_at: null,
        updated_at: 0,
      };
    }

    function makeLists(): AniListCollection[] {
      const now = Math.floor(Date.now() / 1000);
      return [
        {
          name: "Watching",
          entries: [
            makeEntry(1, now + 3600, "CURRENT"),
            makeEntry(2, null, "CURRENT"),
            makeEntry(3, now + 7200, "PLANNING"),
          ],
        },
      ];
    }

    it("keeps only entries with airing data sorted by time", () => {
      const rows = collectAiringRows(makeLists(), "");
      expect(rows.map((r) => r.id)).toEqual([1, 3]);
      expect(rows[0]?.episode).toBe(3);
    });

    it("dedupes entries shared across lists", () => {
      const shared = makeLists()[0]?.entries[0];
      if (!shared) throw new Error("fixture missing");
      const lists: AniListCollection[] = [
        { name: "Watching", entries: [shared] },
        { name: "Custom", entries: [shared] },
      ];
      expect(collectAiringRows(lists, "").map((r) => r.id)).toEqual([1]);
    });

    it("filters by list status", () => {
      expect(collectAiringRows(makeLists(), "PLANNING").map((r) => r.id)).toEqual([3]);
      expect(collectAiringRows(makeLists(), "DROPPED")).toHaveLength(0);
    });
  });

  describe("groupAiringByDay", () => {
    it("buckets rows by calendar day within the window", () => {
      const now = Math.floor(Date.now() / 1000);
      const rows = [
        { id: 1, title: "A", cover: null, episode: 2, airingAt: now + 3600, listStatus: "CURRENT" },
        {
          id: 2,
          title: "B",
          cover: null,
          episode: 5,
          airingAt: now + 90_000,
          listStatus: "CURRENT",
        },
        {
          id: 3,
          title: "C",
          cover: null,
          episode: 1,
          airingAt: now + 900_000,
          listStatus: "CURRENT",
        },
      ];
      const days = groupAiringByDay(rows, 7);
      expect(days.length).toBeGreaterThanOrEqual(2);
      expect(days.flatMap((d) => d.rows.map((r) => r.id)).sort()).toEqual([1, 2]);
      expect(days[0]?.rows[0]?.id).toBe(1);
    });

    it("drops stale and out-of-window rows", () => {
      const now = Math.floor(Date.now() / 1000);
      const rows = [
        {
          id: 1,
          title: "A",
          cover: null,
          episode: 2,
          airingAt: now - 200_000,
          listStatus: "CURRENT",
        },
        {
          id: 2,
          title: "B",
          cover: null,
          episode: 5,
          airingAt: now + 3_000_000,
          listStatus: "CURRENT",
        },
      ];
      expect(groupAiringByDay(rows, 7)).toHaveLength(0);
    });
  });
});
