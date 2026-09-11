import type { AnimeDeepLink } from "@/types/deeplink";

export type { AnimeDeepLink };

const DEEP_LINK_SCHEME = "iluhaanime";
export const DEEP_LINK_EVENT = "deep-link-opened";

export function buildAnimeLink(anilistId: number): string {
  return `${DEEP_LINK_SCHEME}://anime/anilist/${anilistId}`;
}

export function parseAnimeLink(raw: string): AnimeDeepLink | null {
  const schemeEnd = raw.trim().toLowerCase().indexOf(`${DEEP_LINK_SCHEME}://`);
  if (schemeEnd !== 0) return null;
  const rest = raw.trim().slice(DEEP_LINK_SCHEME.length + 3);
  if (rest.includes("?") || rest.includes("#")) return null;
  const parts = rest.split("/");
  if (parts.length !== 3 || parts[0] !== "anime" || parts[1] !== "anilist") return null;
  if (!/^\d{1,10}$/.test(parts[2])) return null;
  const id = Number(parts[2]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return { source: "anilist", id };
}

export function ingestDeepLinks(
  urls: unknown,
  openAnime: (link: AnimeDeepLink) => void,
  onInvalid: () => void
): void {
  if (!Array.isArray(urls)) return;
  let bad = false;
  for (const raw of urls) {
    if (typeof raw !== "string") {
      bad = true;
      continue;
    }
    const link = parseAnimeLink(raw);
    if (link) openAnime(link);
    else bad = true;
  }
  if (bad) onInvalid();
}
