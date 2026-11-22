import type { getMangaHistory } from "@/api/manga.api";

export type HistoryEntry = Awaited<ReturnType<typeof getMangaHistory>>[number];
