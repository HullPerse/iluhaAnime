import type { AnimeDeepLink, TorrentDeepLink } from "@/types/deeplink";

export type { AnimeDeepLink, TorrentDeepLink };

const DEEP_LINK_SCHEME = "iluhaanime";
export const DEEP_LINK_EVENT = "deep-link-opened";

export function buildAnimeLink(anilistId: number): string {
  return `${DEEP_LINK_SCHEME}://anime/anilist/${anilistId}`;
}
export function buildTorrentLink(infoHash: string): string {
  return `${DEEP_LINK_SCHEME}://torrent/${infoHash.toLowerCase()}`;
}

export function parseTorrentLink(raw: string): TorrentDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().indexOf(`${DEEP_LINK_SCHEME}://`) !== 0) return null;
  const rest = trimmed.slice(DEEP_LINK_SCHEME.length + 3);
  if (rest.includes("?") || rest.includes("#")) return null;
  const parts = rest.split("/");
  if (parts.length !== 2 || parts[0] !== "torrent") return null;
  if (!/^[0-9a-fA-F]{40}$/.test(parts[1])) return null;
  return { infoHash: parts[1].toLowerCase() };
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
  onInvalid: () => void,
  openTorrent?: (link: TorrentDeepLink) => void
): void {
  if (!Array.isArray(urls)) return;
  let bad = false;
  for (const raw of urls) {
    if (typeof raw !== "string") {
      bad = true;
      continue;
    }
    const anime = parseAnimeLink(raw);
    if (anime) {
      openAnime(anime);
      continue;
    }
    const torrent = openTorrent ? parseTorrentLink(raw) : null;
    if (torrent && openTorrent) openTorrent(torrent);
    else bad = true;
  }
  if (bad) onInvalid();
}

export type PastedLink =
  | { kind: "anime"; link: AnimeDeepLink }
  | { kind: "torrent"; link: TorrentDeepLink };

export function parsePastedLink(text: string): PastedLink | "invalid" | null {
  const trimmed = text.trim();
  if (trimmed.toLowerCase().indexOf(`${DEEP_LINK_SCHEME}://`) !== 0) return null;
  const anime = parseAnimeLink(trimmed);
  if (anime) return { kind: "anime", link: anime };
  const torrent = parseTorrentLink(trimmed);
  if (torrent) return { kind: "torrent", link: torrent };
  return "invalid";
}

export function allowsPastedLink(kind: PastedLink["kind"], activeTab: string): boolean {
  if (kind === "anime") return activeTab === "anilist";
  return activeTab === "torrent";
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest("input, textarea, [contenteditable]") !== null
  );
}
