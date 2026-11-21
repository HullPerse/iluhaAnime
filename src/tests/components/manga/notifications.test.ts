import { describe, expect, it } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { groupMangaChapterUpdates } from "@/lib/manga/mangaNotifications.utils";

describe("manga chapter notifications", () => {
  it("renders the count in the library summary", () => {
    expect(translate("manga.notification.chapters.summary", { count: 13 })).toBe(
      "Новых глав в библиотеке: 13"
    );
  });

  it("keeps five titles separate and sums chapters when a sixth title updates", () => {
    const five = Array.from({ length: 5 }, (_, index) => ({ title: String(index), count: 2 }));
    expect(groupMangaChapterUpdates([])).toEqual([]);
    expect(groupMangaChapterUpdates(five)).toEqual(five);
    expect(groupMangaChapterUpdates([...five, { title: "sixth", count: 3 }])).toEqual([
      { title: null, count: 13 },
    ]);
  });
});
