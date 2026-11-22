import type { MangaChapter } from "@/api/manga.api";
import { translationId } from "@/lib/manga/readerChapter.utils";
import { ChapterRow } from "@/routes/components/manga/detail/chapterRow.detail";

export function ChapterList({
  groups,
  translation,
  reads,
  pendingKeys,
  ready,
  onMark,
  onPick,
}: {
  groups: MangaChapter[][];
  translation: string;
  reads: Set<string>;
  pendingKeys: Set<string>;
  ready: boolean;
  onMark: (keys: string[], read: boolean) => void;
  onPick: (chapter: MangaChapter) => void;
}) {
  return (
    <ul className="divide-muted windows95-border divide-y">
      {groups.map((rows, index) => {
        const chapter = rows[0];

        if (!chapter) return null;
        const lower = Number(groups[index + 1]?.[0]?.number ?? Number.NaN);
        const upper = Number(chapter.number || Number.NaN);
        const translations = rows.filter((row) => translationId(row) === translation);

        return (
          <ChapterRow
            key={chapter.key}
            chapter={chapter}
            selected={translations.find((row) => !row.locked) ?? translations[0]}
            gap={Math.ceil(upper) - Math.floor(lower) > 1}
            read={reads.has(chapter.key)}
            pending={!ready || pendingKeys.has(chapter.key)}
            previousKeys={
              index < groups.length - 1
                ? groups.slice(index + 1).flatMap((rows) => (rows[0] ? [rows[0].key] : []))
                : undefined
            }
            onMark={onMark}
            onPick={onPick}
          />
        );
      })}
    </ul>
  );
}
