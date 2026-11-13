import { MAGNET_RX } from "@/config/system/common.config";
import type {
  AnimeDeepLink,
  AnilistAuthDeepLink,
  CardGiftDeepLink,
  CardGiftReceiptDeepLink,
  NewsDeepLink,
  PastedLink,
  StreamDeepLink,
  TorrentDeepLink,
} from "@/types/core/deeplink";
import {
  parseCardGiftLink,
  parseCardGiftReceiptLink,
} from "@/lib/cards/gift.utils";
import type { AniListId, TorrentHash } from "@/types/core/types";

export type {
  AnimeDeepLink,
  AnilistAuthDeepLink,
  CardGiftDeepLink,
  CardGiftReceiptDeepLink,
  NewsDeepLink,
  PastedLink,
  StreamDeepLink,
  TorrentDeepLink,
};

const DEEP_LINK_SCHEME = "iluhaanime";
export const DEEP_LINK_EVENT = "deep-link-opened";
export function buildAnimeLink(
  anilistId: AniListId
): `${typeof DEEP_LINK_SCHEME}://anime/anilist/${number}` {
  return `${DEEP_LINK_SCHEME}://anime/anilist/${anilistId}`;
}
export function buildStreamLink(
  slug: string
): `${typeof DEEP_LINK_SCHEME}://stream/animelib/${string}` {
  return `${DEEP_LINK_SCHEME}://stream/animelib/${slug}`;
}
export function buildTorrentLink(
  infoHash: TorrentHash
): `${typeof DEEP_LINK_SCHEME}://torrent/${string}` {
  return `${DEEP_LINK_SCHEME}://torrent/${infoHash.toLowerCase()}`;
}
/** The feed page travels with the id, so the post can be found again without paging around. */
export function buildNewsLink(id: number, page: number): string {
  return `${DEEP_LINK_SCHEME}://news/${id}?page=${page}`;
}

const NEWS_LINK_PREFIX = `${DEEP_LINK_SCHEME}://news/`;
const NEWS_MAX_PAGE = 500;

export function parseNewsLink(raw: string): NewsDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().indexOf(NEWS_LINK_PREFIX) !== 0) return null;
  const rest = trimmed.slice(NEWS_LINK_PREFIX.length);
  if (rest.includes("#")) return null;
  const queryStart = rest.indexOf("?");
  const path = queryStart === -1 ? rest : rest.slice(0, queryStart);
  const query = queryStart === -1 ? "" : rest.slice(queryStart + 1);
  if (!/^\d{1,10}$/.test(path)) return null;
  const id = Number(path);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  let page = 1;
  if (query !== "") {
    const rawPage = new URLSearchParams(query).get("page");
    if (rawPage === null || !/^\d{1,3}$/.test(rawPage)) return null;
    page = Number(rawPage);
    if (page < 1 || page > NEWS_MAX_PAGE) return null;
  }
  return { id, page };
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

export function parseStreamLink(raw: string): StreamDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().indexOf(`${DEEP_LINK_SCHEME}://`) !== 0) return null;
  const rest = trimmed.slice(DEEP_LINK_SCHEME.length + 3);
  if (rest.includes("?") || rest.includes("#")) return null;
  const parts = rest.split("/");
  if (parts.length !== 3 || parts[0] !== "stream" || parts[1] !== "animelib") return null;
  const slug = parts[2];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(slug) || !slug.includes("--")) return null;
  return { source: "animelib", slug };
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
  return { source: "anilist", id: id as AniListId };
}

const AUTH_PREFIX = `${DEEP_LINK_SCHEME}://auth/anilist`;
const AUTH_TOKEN_MAX_CHARS = 4096;

export function parseAnilistAuthCallback(raw: string): AnilistAuthDeepLink | null {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().indexOf(AUTH_PREFIX) !== 0) return null;
  const rest = trimmed.slice(AUTH_PREFIX.length);
  if (rest !== "" && !rest.startsWith("?") && !rest.startsWith("#")) return null;
  const hashIndex = rest.indexOf("#");
  const queryPart = (hashIndex !== -1 ? rest.slice(0, hashIndex) : rest).replace(/^\?/, "");
  const fragmentPart = hashIndex !== -1 ? rest.slice(hashIndex + 1) : "";
  const params = new URLSearchParams(fragmentPart || queryPart);
  const token = (params.get("access_token") ?? "").trim();
  if (token.length === 0 || token.length > AUTH_TOKEN_MAX_CHARS || /\s/.test(token)) return null;
  return { accessToken: token };
}

type DeepLinkHandlers = {
  openAnime: (link: AnimeDeepLink) => void;
  openTorrent?: (link: TorrentDeepLink) => void;
  openAuth?: (link: AnilistAuthDeepLink) => void;
  openStream?: (link: StreamDeepLink) => void;
  openNews?: (link: NewsDeepLink) => void;
  openGift?: (link: CardGiftDeepLink) => void;
  openGiftReceipt?: (link: CardGiftReceiptDeepLink) => void;
};

function routeDeepLink(raw: string, handlers: DeepLinkHandlers): boolean {
  if (handlers.openAuth) {
    const auth = parseAnilistAuthCallback(raw);
    if (auth) {
      handlers.openAuth(auth);
      return true;
    }
  }
  const receipt = handlers.openGiftReceipt ? parseCardGiftReceiptLink(raw) : null;
  if (receipt && handlers.openGiftReceipt) {
    handlers.openGiftReceipt(receipt);
    return true;
  }
  const gift = handlers.openGift ? parseCardGiftLink(raw) : null;
  if (gift && handlers.openGift) {
    handlers.openGift(gift);
    return true;
  }
  const news = handlers.openNews ? parseNewsLink(raw) : null;
  if (news && handlers.openNews) {
    handlers.openNews(news);
    return true;
  }
  const anime = parseAnimeLink(raw);
  if (anime) {
    handlers.openAnime(anime);
    return true;
  }
  const stream = handlers.openStream ? parseStreamLink(raw) : null;
  if (stream && handlers.openStream) {
    handlers.openStream(stream);
    return true;
  }
  const torrent = handlers.openTorrent ? parseTorrentLink(raw) : null;
  if (torrent && handlers.openTorrent) {
    handlers.openTorrent(torrent);
    return true;
  }
  return false;
}

export function ingestDeepLinks(
  urls: unknown,
  openAnime: (link: AnimeDeepLink) => void,
  onInvalid: () => void,
  openTorrent?: (link: TorrentDeepLink) => void,
  openAuth?: (link: AnilistAuthDeepLink) => void,
  openStream?: (link: StreamDeepLink) => void,
  openNews?: (link: NewsDeepLink) => void,
  openGift?: (link: CardGiftDeepLink) => void,
  openGiftReceipt?: (link: CardGiftReceiptDeepLink) => void
): void {
  if (!Array.isArray(urls)) return;
  const handlers: DeepLinkHandlers = {
    openAnime,
    openTorrent,
    openAuth,
    openStream,
    openNews,
    openGift,
    openGiftReceipt,
  };
  let bad = false;
  for (const raw of urls) {
    if (typeof raw !== "string" || !routeDeepLink(raw, handlers)) {
      bad = true;
    }
  }
  if (bad) onInvalid();
}

export function parseAnilistPageUrl(raw: string): AnimeDeepLink | null {
  const match = /^https:\/\/anilist\.co\/anime\/(\d{1,10})(?:\/[^\s?#]*)?\/?$/i.exec(raw.trim());
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return { source: "anilist", id: id as AniListId };
}

export function parsePastedLink(text: string): PastedLink | "invalid" | null {
  const trimmed = text.trim();
  if (trimmed.toLowerCase().indexOf(`${DEEP_LINK_SCHEME}://`) === 0) {
    const anime = parseAnimeLink(trimmed);
    if (anime) return { kind: "anime", link: anime };
    const stream = parseStreamLink(trimmed);
    if (stream) return { kind: "stream", link: stream };
    const torrent = parseTorrentLink(trimmed);
    if (torrent) return { kind: "torrent", link: torrent };
    const news = parseNewsLink(trimmed);
    if (news) return { kind: "news", link: news };
    const receipt = parseCardGiftReceiptLink(trimmed);
    if (receipt) return { kind: "gift-receipt", link: receipt };
    const gift = parseCardGiftLink(trimmed);
    if (gift) return { kind: "gift", link: gift };
    return "invalid";
  }
  if (MAGNET_RX.test(trimmed)) return { kind: "magnet", magnet: trimmed };
  const page = parseAnilistPageUrl(trimmed);
  if (page) return { kind: "anime", link: page };
  return null;
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest("input, textarea, [contenteditable]") !== null
  );
}
