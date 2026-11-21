import type { MangaChapter } from "@/api/manga.api";

export function translationId(chapter: MangaChapter): string {
  return `${chapter.language}:${chapter.group ?? ""}`;
}

export function readerChapter(
  translations: readonly MangaChapter[],
  current: MangaChapter
): MangaChapter | undefined {
  const available = translations.filter((chapter) => !chapter.locked);
  const currentTranslation = translationId(current);
  return (
    available.find((chapter) => chapter.id === current.id) ??
    available.find((chapter) => translationId(chapter) === currentTranslation) ??
    available.find((chapter) => chapter.language === current.language) ??
    available[0]
  );
}
