import type { mangaSources } from "@/config/manga/sources.config";

export type MangaSource = (typeof mangaSources)[number]["id"];
export type MangaPersonRole = "author" | "artist";
export interface MangaPersonSearch {
  name: string;
  role: MangaPersonRole;
  key?: string;
  source?: MangaSource;
}
export type MangaServer = "first" | "second" | "compressed";
