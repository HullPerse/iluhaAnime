export interface MangaChapterUpdate {
  title: string;
  count: number;
}

export interface MangaChapterSummary {
  title: string | null;
  count: number;
}

const SUMMARY_THRESHOLD = 5;

export function groupMangaChapterUpdates(updates: MangaChapterUpdate[]): MangaChapterSummary[] {
  if (updates.length <= SUMMARY_THRESHOLD) return updates;

  return [
    {
      title: null,
      count: updates.reduce((total, update) => total + update.count, 0),
    },
  ];
}
