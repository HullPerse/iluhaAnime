import { describe, expect, it } from "vitest";

import {
  airingCountdownSecs,
  formatAiringCountdown,
  formatAiringLocal,
  formatAiringTime,
} from "@/lib/anilist/airing.utils";
import { translate } from "@/lib/locale/i18n.utils";

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
});
