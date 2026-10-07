import { AUDIO_EXTS, SUBTITLE_EXTS, VIDEO_EXTS } from "@/config/media/tokens.config";
import type { MediaNameToken } from "@/types/media";

const KNOWN_EXTS = new Set(
  [...VIDEO_EXTS, ...SUBTITLE_EXTS, ...AUDIO_EXTS].map((ext) => ext.toLowerCase())
);

export function stripMediaExtension(filename: string): {
  stem: string;
  ext: string | null;
} {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { stem: filename, ext: null };
  const ext = filename.slice(dot + 1).toLowerCase();
  if (!KNOWN_EXTS.has(ext)) return { stem: filename, ext: null };
  return { stem: filename.slice(0, dot), ext };
}

// Unicode dashes (en/em) seen in real release names, normalized to hyphen.
const DASH_RX = /[\u2010-\u2015\u2212]/g;

const GROUP_RX = /\[([^\]]*)\]|\(([^)]*)\)/g;

// Split on delimiter runs, but keep digit-hyphen-digit atoms (133-134) whole.
const PLAIN_SPLIT_RX = /-(?!\d)|(?<!\d)-|[ ._]+/;

function splitPlain(chunk: string): string[] {
  return chunk.split(PLAIN_SPLIT_RX).filter((part) => part.length > 0);
}

export function normalizeMediaDashes(text: string): string {
  return text.replace(DASH_RX, "-");
}

export function tokenizeMediaName(stem: string): MediaNameToken[] {
  const normalized = normalizeMediaDashes(stem);
  const tokens: MediaNameToken[] = [];
  let last = 0;
  GROUP_RX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GROUP_RX.exec(normalized)) !== null) {
    for (const part of splitPlain(normalized.slice(last, match.index))) {
      tokens.push({ value: part, enclosed: "plain" });
    }
    const inner = (match[1] ?? match[2] ?? "").trim();
    if (inner) {
      tokens.push({ value: inner, enclosed: match[1] !== undefined ? "bracket" : "paren" });
    }
    last = match.index + match[0].length;
  }
  for (const part of splitPlain(normalized.slice(last))) {
    tokens.push({ value: part, enclosed: "plain" });
  }
  return tokens;
}
