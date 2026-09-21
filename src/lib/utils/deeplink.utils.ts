import { MAGNET_RX } from "@/config/torrent/common.config";
import { attemptAll, attemptSync } from "@/lib/utils/attempt.utils";
import { attemptResult, attemptResultSync, unwrapOr } from "@/lib/utils/result.utils";
import type { CollectionExternalIds, CollectionItem, CollectionType } from "@/types/collection";
import type {
  AnimeDeepLink,
  CollectionShareDeepLink,
  CollectionShareItem,
  TorrentDeepLink,
} from "@/types/deeplink";

export type { AnimeDeepLink, CollectionShareDeepLink, TorrentDeepLink };

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
  openTorrent?: (link: TorrentDeepLink) => void,
  openShare?: (rawUrl: string) => void
): void {
  if (!Array.isArray(urls)) return;
  let bad = false;
  for (const raw of urls) {
    if (typeof raw !== "string") {
      bad = true;
      continue;
    }
    if (openShare && looksLikeCollectionShareLink(raw)) {
      openShare(raw);
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
  | { kind: "torrent"; link: TorrentDeepLink }
  | { kind: "magnet"; magnet: string }
  | { kind: "collectionShare" };

export function parseAnilistPageUrl(raw: string): AnimeDeepLink | null {
  const match = /^https:\/\/anilist\.co\/anime\/(\d{1,10})(?:\/[^\s?#]*)?\/?$/i.exec(raw.trim());
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return { source: "anilist", id };
}

export function parsePastedLink(text: string): PastedLink | "invalid" | null {
  const trimmed = text.trim();
  if (trimmed.toLowerCase().indexOf(`${DEEP_LINK_SCHEME}://`) === 0) {
    if (looksLikeCollectionShareLink(trimmed)) return { kind: "collectionShare" };
    const anime = parseAnimeLink(trimmed);
    if (anime) return { kind: "anime", link: anime };
    const torrent = parseTorrentLink(trimmed);
    if (torrent) return { kind: "torrent", link: torrent };
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

const COLLECTION_SHARE_PREFIX = `${DEEP_LINK_SCHEME}://collection/share/`;
const SHARE_VERSION = 1 as const;

const SHARE_MAX_ITEMS = 500;
const SHARE_MAX_LABEL = 80;
const SHARE_MAX_TITLE = 200;
const SHARE_MAX_STATUS = 64;
const SHARE_MAX_COVER_URL = 2048;
const SHARE_MAX_PAYLOAD_CHARS = 262_144;
const SHARE_MAX_BYTES = 1_000_000;

const SHARE_TYPES: readonly CollectionType[] = ["anime", "movie", "series", "custom"];

interface ByteTransform {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCollectionType(value: unknown): value is CollectionType {
  return typeof value === "string" && (SHARE_TYPES as readonly string[]).includes(value);
}

function readShareId(value: unknown): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    return undefined;
  }
  return value;
}

function normalizeYear(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1000 && value <= 9999 ? value : null;
}

function normalizeCoverUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > SHARE_MAX_COVER_URL) return null;
  const [parsed, error] = attemptSync(() => new URL(trimmed));
  if (error !== null) return null;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

function normalizeExternalIds(value: unknown): CollectionExternalIds {
  const ids: CollectionExternalIds = {};
  if (!isRecord(value)) return ids;
  const anilist = readShareId(value.anilist);
  if (anilist !== undefined) ids.anilist = anilist;
  const mal = readShareId(value.mal);
  if (mal !== undefined) ids.mal = mal;
  const tmdb = readShareId(value.tmdb);
  if (tmdb !== undefined) ids.tmdb = tmdb;
  if (typeof value.imdb === "string" && /^tt\d{5,10}$/.test(value.imdb)) ids.imdb = value.imdb;
  return ids;
}

function toShareItem(item: CollectionItem): CollectionShareItem {
  return {
    title: item.title.trim().slice(0, SHARE_MAX_TITLE),
    type: item.type,
    year: normalizeYear(item.year),
    status: item.status.trim().slice(0, SHARE_MAX_STATUS),
    externalIds: normalizeExternalIds(item.externalIds),
    coverUrl: normalizeCoverUrl(item.coverUrl),
  };
}

function readShareItem(value: unknown): CollectionShareItem | null {
  if (!isRecord(value)) return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (title.length === 0 || title.length > SHARE_MAX_TITLE) return null;
  if (!isCollectionType(value.type)) return null;
  const status = typeof value.status === "string" ? value.status.trim() : "";
  if (status.length === 0 || status.length > SHARE_MAX_STATUS) return null;
  return {
    title,
    type: value.type,
    year: normalizeYear(value.year),
    status,
    externalIds: normalizeExternalIds(value.externalIds),
    coverUrl: normalizeCoverUrl(value.coverUrl),
  };
}

function readSharePayload(value: unknown): CollectionShareDeepLink | null {
  if (!isRecord(value) || value.version !== SHARE_VERSION) return null;
  if (!Array.isArray(value.items)) return null;
  if (value.items.length === 0 || value.items.length > SHARE_MAX_ITEMS) return null;
  const items: CollectionShareItem[] = [];
  for (const raw of value.items) {
    const item = readShareItem(raw);
    if (!item) return null;
    items.push(item);
  }
  const label =
    typeof value.label === "string" && value.label.trim().length > 0
      ? value.label.trim().slice(0, SHARE_MAX_LABEL)
      : null;
  return { version: SHARE_VERSION, label, items };
}

async function collectBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const read = await attemptResult(
    (async (): Promise<boolean> => {
      for (;;) {
        const result = await reader.read();
        if (result.done) return false;
        total += result.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return true;
        }
        chunks.push(result.value);
      }
    })()
  );
  reader.releaseLock();
  if (!read.ok || read.value) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function runByteTransform(
  transform: ByteTransform,
  input: Uint8Array,
  maxBytes: number
): Promise<Uint8Array | null> {
  const writer = transform.writable.getWriter();
  const collected = collectBytes(transform.readable, maxBytes);
  // A failure here is expected: the reader side may abort first (size cap or a malformed gzip stream).
  await attemptAll([() => writer.write(input), () => writer.close()]);
  return collected;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  if (remainder === 1) return null;
  const padded = remainder === 0 ? base64 : base64 + "=".repeat(4 - remainder);
  const bytes = attemptResultSync(() => {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      out[index] = binary.codePointAt(index) ?? 0;
    }
    return out;
  });
  return unwrapOr(bytes, null);
}

/**
 * Builds a self-contained, gzip-compressed `iluhaanime://collection/share/...` link
 * carrying a slim, allowlisted snapshot of the given items. No images or notes are
 * embedded, so covers stay remote CDN URLs that load without an API call.
 *
 * Throws when the selection is empty or larger than the parser accepts, so callers
 * can fall back to the JSON/ZIP export instead of handing out a link nobody can read.
 */
export async function buildCollectionShareLink(
  items: readonly CollectionItem[],
  label?: string | null
): Promise<string> {
  if (items.length === 0) throw new Error("Cannot share an empty collection status");
  if (items.length > SHARE_MAX_ITEMS) {
    throw new Error(`Cannot share more than ${SHARE_MAX_ITEMS} items`);
  }
  const payload: CollectionShareDeepLink = {
    version: SHARE_VERSION,
    label:
      typeof label === "string" && label.trim().length > 0
        ? label.trim().slice(0, SHARE_MAX_LABEL)
        : null,
    items: items.map(toShareItem),
  };
  const compressed = await runByteTransform(
    new CompressionStream("gzip") as unknown as ByteTransform,
    new TextEncoder().encode(JSON.stringify(payload)),
    SHARE_MAX_BYTES
  );
  if (!compressed) throw new Error("Collection share payload is too large");
  return `${COLLECTION_SHARE_PREFIX}${bytesToBase64Url(compressed)}`;
}

/**
 * Parses a collection share link back into its snapshot, or returns `null` for
 * anything that is not a well-formed link. Every field passes through the same
 * allowlist and length caps as the builder, and the gzip stream is size-capped so
 * a small payload cannot expand into an unbounded balloon.
 */
export async function parseCollectionShareLink(
  raw: string
): Promise<CollectionShareDeepLink | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.toLowerCase().startsWith(COLLECTION_SHARE_PREFIX)) return null;
  const segment = trimmed.slice(COLLECTION_SHARE_PREFIX.length);
  if (segment.length === 0 || segment.length > SHARE_MAX_PAYLOAD_CHARS) return null;
  const compressed = base64UrlToBytes(segment);
  if (!compressed) return null;
  const decompressed = await runByteTransform(
    new DecompressionStream("gzip") as unknown as ByteTransform,
    compressed,
    SHARE_MAX_BYTES
  );
  if (!decompressed) return null;
  const decoded = attemptResultSync(
    () => JSON.parse(new TextDecoder().decode(decompressed)) as unknown
  );
  return decoded.ok ? readSharePayload(decoded.value) : null;
}

/** Cheap prefix check so paste/OS-link handlers can decide to await the full parse. */
function looksLikeCollectionShareLink(raw: string): boolean {
  return raw.trim().toLowerCase().startsWith(COLLECTION_SHARE_PREFIX);
}
