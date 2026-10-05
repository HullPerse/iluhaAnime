import { LOBBY_CHAT_IMAGE_MAX } from "@/config/lobby/common.config";
import { MAGNET_RX } from "@/config/torrent/common.config";
import { buildHostMagnet } from "@/lib/session/source.utils";
import { parsePastedLink, parseTorrentLink } from "@/lib/utils/deeplink.utils";

export interface ChatSegment {
  kind: "text" | "link" | "emoji" | "mention";
  value: string;
}

const WEB_URL_RX = /^https?:\/\//i;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;

/** True when a chat token is something the user can open (magnet, deep link, URL). */
export function isChatLink(token: string): boolean {
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  if (trimmed.length === 0) return false;
  if (MAGNET_RX.test(trimmed)) return true;
  if (WEB_URL_RX.test(trimmed)) return true;
  return parsePastedLink(trimmed) !== null;
}

/**
 * True when a chat token opens the torrent file-selection flow instead of the
 * browser: a magnet or an `iluhaanime://torrent/<hex>` link (lobby.md §14.4).
 */
export function isTorrentLink(token: string): boolean {
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  if (trimmed.length === 0) return false;
  if (MAGNET_RX.test(trimmed)) return true;
  return parseTorrentLink(trimmed) !== null;
}

/**
 * The magnet a chat torrent link downloads from: the magnet itself, or a bare
 * info-hash magnet built from an `iluhaanime://torrent/<hex>` link. Returns
 * `null` when the token is not a torrent link.
 */
export function torrentLinkMagnet(token: string): string | null {
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  if (trimmed.length === 0) return null;
  if (MAGNET_RX.test(trimmed)) return trimmed;
  const link = parseTorrentLink(trimmed);
  return link ? buildHostMagnet(link.infoHash, "") : null;
}

/**
 * Token shape of a custom emoji shortcode: `:iluha_name:`. Only the syntax is
 * checked here — whether the file exists is decided at render time, so an
 * unknown shortcode falls back to its literal text.
 */
const EMOJI_SHORTCODE_RX = /^:iluha_[a-z0-9_-]+:$/i;

/** After a `@name` token only whitespace or sentence punctuation may follow. */
const MENTION_BOUNDARY_RX = /[\s,.!?;:)\]]/;

/**
 * Split off `@Name` mentions that match a known roster name. Names are matched
 * case-insensitively, longest first (so `Alice` wins over a prefix `Al`), and
 * must start at a word boundary. Returns index ranges into `text`.
 */
function mentionRanges(text: string, names: readonly string[]): [number, number][] {
  const candidates = names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length);
  if (candidates.length === 0) return [];

  const ranges: [number, number][] = [];
  const lower = text.toLowerCase();
  for (const name of candidates) {
    const needle = `@${name.toLowerCase()}`;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      const beforeOk = at === 0 || /[\s([{]/.test(text[at - 1] ?? "");
      const afterOk =
        end >= text.length || MENTION_BOUNDARY_RX.test(text[end] ?? "");
      // Skip overlaps already claimed by a longer name matched earlier.
      const overlaps = ranges.some(([s, e]) => at < e && end > s);
      if (beforeOk && afterOk && !overlaps) ranges.push([at, end]);
      from = at + needle.length;
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * Split a chat line into plain text, clickable link tokens, custom emoji
 * shortcodes, and `@Name` mentions while keeping the original text and
 * whitespace intact. Trailing punctuation after a link stays as separate text
 * so nothing is lost. `mentionNames` is the roster used to recognize a mention;
 * without it, `@text` stays plain.
 */
export function chatSegments(
  text: string,
  mentionNames: readonly string[] = []
): ChatSegment[] {
  const ranges = mentionRanges(text, mentionNames);
  const segments: ChatSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) tokenizePlain(text.slice(cursor, start), segments);
    segments.push({ kind: "mention", value: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) tokenizePlain(text.slice(cursor), segments);
  return segments;
}

/** The non-mention core of `chatSegments`: links, emoji shortcodes, plain text. */
function tokenizePlain(chunk: string, segments: ChatSegment[]): void {
  for (const part of chunk.split(/(\s+)/)) {
    if (part.length === 0) continue;
    if (/^\s+$/.test(part)) {
      segments.push({ kind: "text", value: part });
      continue;
    }
    const match = TRAILING_PUNCTUATION.exec(part);
    const trailing = match ? match[0] : "";
    const core = trailing.length > 0 ? part.slice(0, -trailing.length) : part;
    if (core.length > 0 && isChatLink(core)) {
      segments.push({ kind: "link", value: core });
      if (trailing.length > 0) segments.push({ kind: "text", value: trailing });
    } else if (core.length > 0 && EMOJI_SHORTCODE_RX.test(core)) {
      segments.push({ kind: "emoji", value: core.slice(1, -1).toLowerCase() });
      if (trailing.length > 0) segments.push({ kind: "text", value: trailing });
    } else {
      segments.push({ kind: "text", value: part });
    }
  }
}

const IMAGE_LINK_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"] as const;

/**
 * Image URLs to embed under a chat message, Discord-style: https-only,
 * image extension in the path, deduplicated, capped at `LOBBY_CHAT_IMAGE_MAX`.
 * Local or plain-http links never become previews.
 */
export function imagePreviewLinks(text: string): string[] {
  const previews: string[] = [];
  for (const segment of chatSegments(text)) {
    if (segment.kind !== "link") continue;
    if (!segment.value.startsWith("https://")) continue;
    let pathname: string;
    try {
      pathname = new URL(segment.value).pathname.toLowerCase();
    } catch {
      continue;
    }
    if (!IMAGE_LINK_EXTENSIONS.some((extension) => pathname.endsWith(extension))) continue;
    if (previews.includes(segment.value)) continue;
    previews.push(segment.value);
    if (previews.length >= LOBBY_CHAT_IMAGE_MAX) break;
  }
  return previews;
}

/**
 * Client-generated chat message id (UUID without braces fits the backend's
 * `[A-Za-z0-9_-]{1,64}` rule). Used as the optimistic-echo and reply anchor.
 */
export function newChatId(): string {
  return crypto.randomUUID();
}

/** `HH:MM` wall clock for a chat timestamp in seconds. */
export function formatChatClock(atSeconds: number): string {
  if (!Number.isFinite(atSeconds) || atSeconds <= 0) return "--:--";
  const date = new Date(atSeconds * 1000);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Built once: `Intl.Segmenter` construction is the expensive part. */
const GRAPHEME_SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/**
 * Count user-perceived characters (graphemes), matching the backend's
 * `sanitize_chat_text` cap. `Intl.Segmenter` is available in the WebView2
 * runtime; the spread fallback counts code points, which is still closer
 * than UTF-16 units (an emoji is 2+ of those).
 */
export function countGraphemes(text: string): number {
  if (GRAPHEME_SEGMENTER) {
    let count = 0;
    for (const _ of GRAPHEME_SEGMENTER.segment(text)) count += 1;
    return count;
  }
  return [...text].length;
}
