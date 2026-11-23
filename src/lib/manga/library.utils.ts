import type { LibraryCopy } from "@/api/manga.api";

export function mangaReadProgress(item: Pick<LibraryCopy, "read" | "unread">) {
  const total = item.read + item.unread;

  return total > 0 ? item.read / total : 0;
}

export const compareItems = {
  progress: (a: LibraryCopy, b: LibraryCopy) => mangaReadProgress(a) - mangaReadProgress(b),
  lastRead: (a: LibraryCopy, b: LibraryCopy) => (a.lastReadAt ?? 0) - (b.lastReadAt ?? 0),
  updated: (a: LibraryCopy, b: LibraryCopy) => a.updatedAt - b.updatedAt,
  title: (a: LibraryCopy, b: LibraryCopy) => a.title.localeCompare(b.title, "ru"),
  chapters: (a: LibraryCopy, b: LibraryCopy) => a.read + a.unread - b.read - b.unread,
};
