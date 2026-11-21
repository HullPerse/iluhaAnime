import type { MangaSource } from "@/api/manga.api";

export type MangaSourceNsfw = Record<string, boolean>;

export function sourceShowsNsfw(bySource: MangaSourceNsfw, source: MangaSource): boolean {
  return bySource[source] === true;
}

export function mangaRatingVisible(
  rating: string | null | undefined,
  bySource: MangaSourceNsfw,
  source: MangaSource
): boolean {
  return rating !== "pornographic" || sourceShowsNsfw(bySource, source);
}

export function mangaRatingMosaic(
  rating: string | null | undefined,
  bySource: MangaSourceNsfw,
  source: MangaSource
): boolean {
  return (
    (rating === "suggestive" || rating === "pornographic") && !sourceShowsNsfw(bySource, source)
  );
}
