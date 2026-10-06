import { LOBBY_CHAT_IMAGE_MAX } from "@/config/lobby/common.config";
import { MAGNET_RX } from "@/config/torrent/common.config";
import { buildHostMagnet } from "@/lib/session/source.utils";
import { parsePastedLink, parseTorrentLink } from "@/lib/utils/deeplink.utils";

export type ChatMark = "bold" | "italic" | "strike" | "spoiler";

export interface ChatSegment {
  kind: "text" | "link" | "emoji" | "mention";
  value: string;
  marks?: ChatMark[];
}

interface MarkPiece {
  text: string;
  marks: ChatMark[];
}

/** Longest token first, so **bold** wins over italic. */
const FORMAT_DELIMS: ReadonlyArray<readonly [string, ChatMark]> = [
  ["**", "bold"],
  ["~~", "strike"],
  ["||", "spoiler"],
  ["*", "italic"],
];

function matchOpen(text: string, at: number): readonly [string, ChatMark] | null {
  for (const entry of FORMAT_DELIMS) {
    if (text.startsWith(entry[0], at)) return entry;
  }
  return null;
}

/** Closed spans only; unclosed delimiters stay literal; first closer wins. */
function parseMarks(text: string, marks: ChatMark[]): MarkPiece[] {
  const pieces: MarkPiece[] = [];
  let plain = "";
  let index = 0;
  while (index < text.length) {
    const open = matchOpen(text, index);
    if (open) {
      const [token, mark] = open;
      const closeAt = text.indexOf(token, index + token.length);
      if (closeAt !== -1) {
        if (plain.length > 0) {
          pieces.push({ text: plain, marks: [...marks] });
          plain = "";
        }
        pieces.push(
          ...parseMarks(text.slice(index + token.length, closeAt), [...marks, mark])
        );
        index = closeAt + token.length;
        continue;
      }
    }
    plain += text[index];
    index += 1;
  }
  if (plain.length > 0) pieces.push({ text: plain, marks: [...marks] });
  return pieces;
}

const WEB_URL_RX = /^https?:\/\//i;
const TRAILING_PUNCTUATION = /[),.;!?]+$/;

export function isChatLink(token: string): boolean {
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  if (trimmed.length === 0) return false;
  if (MAGNET_RX.test(trimmed)) return true;
  if (WEB_URL_RX.test(trimmed)) return true;
  return parsePastedLink(trimmed) !== null;
}

/** Magnet or iluhaanime://torrent/<hex> (lobby.md §14.4). */
export function isTorrentLink(token: string): boolean {
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  if (trimmed.length === 0) return false;
  if (MAGNET_RX.test(trimmed)) return true;
  return parseTorrentLink(trimmed) !== null;
}

/** The magnet itself, or an info-hash magnet built from the link; null otherwise. */
export function torrentLinkMagnet(token: string): string | null {
  const trimmed = token.replace(TRAILING_PUNCTUATION, "");
  if (trimmed.length === 0) return null;
  if (MAGNET_RX.test(trimmed)) return trimmed;
  const link = parseTorrentLink(trimmed);
  return link ? buildHostMagnet(link.infoHash, "") : null;
}

/** Syntax only; existence is decided at render time. */
const EMOJI_SHORTCODE_RX = /^:iluha_[a-z0-9_-]+:$/i;

const MENTION_BOUNDARY_RX = /[\s,.!?;:)\]]/;

/** Case-insensitive, longest-first, word-boundary; returns index ranges. */
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
      const overlaps = ranges.some(([s, e]) => at < e && end > s);
      if (beforeOk && afterOk && !overlaps) ranges.push([at, end]);
      from = at + needle.length;
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** Plain text, link tokens, emoji shortcodes, @mentions; whitespace intact, formatting stamped on leaves. */
export function chatSegments(
  text: string,
  mentionNames: readonly string[] = []
): ChatSegment[] {
  const segments: ChatSegment[] = [];
  for (const piece of parseMarks(text, [])) {
    const from = segments.length;
    splitMentions(piece.text, mentionNames, segments);
    if (piece.marks.length > 0) {
      for (let i = from; i < segments.length; i += 1) {
        segments[i] = { ...segments[i], marks: piece.marks };
      }
    }
  }
  return segments;
}

function splitMentions(
  text: string,
  mentionNames: readonly string[],
  segments: ChatSegment[]
): void {
  const ranges = mentionRanges(text, mentionNames);
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) tokenizePlain(text.slice(cursor, start), segments);
    segments.push({ kind: "mention", value: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) tokenizePlain(text.slice(cursor), segments);
}

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

/** Https-only image URLs, deduped, capped at LOBBY_CHAT_IMAGE_MAX. */
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

/** UUID fitting the backend anchor rule; optimistic-echo and reply anchor. */
export function newChatId(): string {
  return crypto.randomUUID();
}

export function formatChatClock(atSeconds: number): string {
  if (!Number.isFinite(atSeconds) || atSeconds <= 0) return "--:--";
  const date = new Date(atSeconds * 1000);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Module-level: construction is the expensive part. */
const GRAPHEME_SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Grapheme count matching the backend sanitize_chat_text cap. */
export function countGraphemes(text: string): number {
  if (GRAPHEME_SEGMENTER) {
    let count = 0;
    for (const _ of GRAPHEME_SEGMENTER.segment(text)) count += 1;
    return count;
  }
  return [...text].length;
}

export const ANIME_MENTION_PREFIX = "anime:";

export interface AnimeMentionTrigger {
  query: string;
  start: number;
  end: number;
}

/** Trailing @anime:<query> (spaces allowed); other @partial stays a roster mention. */
export function animeMentionTrigger(draft: string): AnimeMentionTrigger | null {
  const match = /(?:^|\s)@([^@\n]*)$/.exec(draft);
  if (match === null) return null;
  const body = match[1] ?? "";
  if (!body.startsWith(ANIME_MENTION_PREFIX)) return null;
  const start = draft.length - body.length - 1;
  return {
    end: draft.length,
    query: body.slice(ANIME_MENTION_PREFIX.length).trim(),
    start,
  };
}

export function replaceAnimeMention(
  draft: string,
  trigger: AnimeMentionTrigger,
  title: string
): string {
  return `${draft.slice(0, trigger.start)}${title} `;
}

export function animeIdsFromLinks(links: readonly string[]): number[] {
  const ids: number[] = [];
  for (const link of links) {
    const parsed = parsePastedLink(link);
    if (parsed === null || parsed === "invalid" || parsed.kind !== "anime") continue;
    if (!ids.includes(parsed.link.id)) ids.push(parsed.link.id);
  }
  return ids;
}

/** Pasted anilist.co/anime/ URLs via the same segmenter the renderer uses. */
export function animeIdsFromText(text: string): number[] {
  const ids: number[] = [];
  for (const segment of chatSegments(text)) {
    if (segment.kind !== "link") continue;
    const parsed = parsePastedLink(segment.value);
    if (parsed === null || parsed === "invalid" || parsed.kind !== "anime") continue;
    if (!ids.includes(parsed.link.id)) ids.push(parsed.link.id);
  }
  return ids;
}
