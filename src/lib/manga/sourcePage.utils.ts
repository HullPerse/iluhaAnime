import type { MangaSource } from "@/api/manga.api";
import type { MangaLibDomain } from "@/types/ui/settings";

const SOURCE_ORIGINS: Record<Exclude<MangaSource, "mangalib">, string> = {
  mangadex: "https://mangadex.org",
  readmanga: "https://readmanga.me",
  asurascans: "https://asurascans.com",
  wamanga: "https://wamanga.ru",
};

const TITLE_PATHS: Record<MangaSource, string> = {
  mangalib: "/ru/manga/",
  mangadex: "/title/",
  readmanga: "/",
  asurascans: "/comics/",
  wamanga: "/",
};

export function mangaSourceOrigin(source: MangaSource, domain: MangaLibDomain): string {
  return source === "mangalib" ? `https://${domain}` : SOURCE_ORIGINS[source];
}

export function mangaTitleUrl(
  source: MangaSource,
  id: string,
  domain: MangaLibDomain,
  webUrl?: string | null
): string | null {
  if (source === "wamanga") return webUrl ?? null;

  if (!/^[a-z0-9_-]{1,160}$/i.test(id)) return null;

  return `${mangaSourceOrigin(source, domain)}${TITLE_PATHS[source]}${id}`;
}
