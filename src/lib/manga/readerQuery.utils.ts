import type { MangaReaderInput, MangaServer } from "@/api/manga.api";
import { settingsAtoms } from "@/store/settings.store";

export const manifestKey = (chapter: MangaReaderInput, server: MangaServer) =>
  [
    "manga",
    "manifest",
    chapter,
    chapter.source === "mangalib" ? settingsAtoms.mangaLibRequestDomain.get() : null,
    chapter.source === "mangalib" ? server : null,
  ] as const;
export const pageKey = (key: string, page: number) => ["manga", "page", key, page] as const;
