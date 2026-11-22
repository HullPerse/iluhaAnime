import type { LibraryCopy } from "@/api/manga.api";

export const compareItems = {
  lastRead: (a: LibraryCopy, b: LibraryCopy) => (a.lastReadAt ?? 0) - (b.lastReadAt ?? 0),
  updated: (a: LibraryCopy, b: LibraryCopy) => a.updatedAt - b.updatedAt,
  title: (a: LibraryCopy, b: LibraryCopy) => a.title.localeCompare(b.title, "ru"),
  chapters: (a: LibraryCopy, b: LibraryCopy) => a.read + a.unread - b.read - b.unread,
};
