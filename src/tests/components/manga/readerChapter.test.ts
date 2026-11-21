import { expect, it } from "vitest";

import type { MangaChapter } from "@/api/manga.api";
import { readerChapter } from "@/lib/manga/readerChapter.utils";

function chapter(
  id: string,
  group: string,
  language: MangaChapter["language"],
  locked = false
): MangaChapter {
  return {
    id,
    group,
    language,
    locked,
    number: "1",
    key: "1",
    volume: null,
    title: null,
    lockReason: null,
    availableAt: null,
    branch: null,
  };
}

it("keeps the active translator and falls back to an unlocked release when needed", () => {
  const current = chapter("current", "A", "ru");
  const sameTranslator = chapter("next-a", "A", "ru");
  const sameLanguage = chapter("next-b", "B", "ru");
  const otherLanguage = chapter("next-c", "C", "en");
  const locked = chapter("locked", "A", "ru", true);

  expect(readerChapter([sameLanguage, sameTranslator], current)).toBe(sameTranslator);
  expect(readerChapter([locked, otherLanguage, sameLanguage], current)).toBe(sameLanguage);
  expect(readerChapter([locked, otherLanguage], current)).toBe(otherLanguage);
  expect(readerChapter([locked], current)).toBeUndefined();
  expect(readerChapter([sameTranslator, current], current)).toBe(current);
});
