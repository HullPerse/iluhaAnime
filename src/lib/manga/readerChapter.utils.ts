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

export function groupChapters(chapters: MangaChapter[]) {
  const groups = new Map<string, MangaChapter[]>();

  for (const chapter of chapters) {
    const group = groups.get(chapter.key);

    if (group) group.push(chapter);
    else groups.set(chapter.key, [chapter]);
  }

  return [...groups.values()];
}

export function translationOptions(groups: readonly (readonly MangaChapter[])[], noGroup: string) {
  const options = new Map<string, { value: string; label: string; count: number }>();

  for (const rows of groups) {
    const counted = new Set<string>();

    for (const row of rows) {
      const value = translationId(row);

      if (counted.has(value)) continue;
      counted.add(value);

      const option = options.get(value);

      if (option) option.count += 1;
      else {
        options.set(value, {
          value,
          label: `${row.language.toUpperCase()} - ${row.group ?? noGroup}`,
          count: 1,
        });
      }
    }
  }

  return [...options.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru")
  );
}
