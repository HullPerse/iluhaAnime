export const sortLabels = {
  progress: "manga.library.sort.progress",
  lastRead: "manga.library.sort.lastRead",
  updated: "manga.library.sort.updated",
  title: "anilist.sort.title",
  chapters: "manga.library.sort.chapters",
} as const;
export const sortKeys = ["lastRead", "updated", "title", "chapters", "progress"] as const;
