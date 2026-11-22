import type * as z from "zod/mini";

import type {
  searchHitSchema,
  chapterSchema,
  itemSchema,
  statusSchema,
} from "@/schemas/manga.schema";
import type { MangaSource } from "@/types/manga/source";

export type MangaChapter = z.infer<typeof chapterSchema>;

export type MangaHit = z.infer<typeof searchHitSchema>;

export type MangaReaderInput = Pick<MangaChapter, "number" | "volume" | "branch"> & {
  source: MangaSource;
  mangaId: string;
  chapterId: string;
};

export type LoadProgress = { loaded: number; total: number | null; cached: boolean };

export type LibraryCopy = z.infer<typeof itemSchema>;

export type MangaStatus = z.infer<typeof statusSchema>;

export type MangaStatusChange =
  | { kind: "edit"; label: string; color: string | null }
  | { kind: "move"; up: boolean }
  | { kind: "moveTo"; target: string }
  | { kind: "delete" };
