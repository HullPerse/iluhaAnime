import { LANG_CODE_MAP } from "@/config/search/languages.config";
import { SIZE_MULTIPLIERS } from "@/config/search/sizes.config";
import type { LanguageTag } from "@/types/search";

const DETECT_CACHE_CAP = 500;
const detectCache = new Map<string, LanguageTag[]>();

export function detectLanguages(title: string): LanguageTag[] {
  const cached = detectCache.get(title);
  if (cached) return cached;
  const tags = detectLanguagesUncached(title);
  if (detectCache.size >= DETECT_CACHE_CAP) {
    const oldest = detectCache.keys().next();
    if (!oldest.done) detectCache.delete(oldest.value);
  }
  detectCache.set(title, tags);
  return tags;
}

function detectLanguagesUncached(title: string): LanguageTag[] {
  const tags: LanguageTag[] = [];
  const upper = title.toUpperCase();

  if (/\bRUS\b/.test(upper) || /\bRU\b/.test(upper) || /\[Рус\]/.test(title))
    tags.push({ code: "ru", label: "RU" });

  if (/\bENG\b/.test(upper) || /\bEN\b/.test(upper)) tags.push({ code: "en", label: "EN" });

  if (/\bMULTISUB\b/.test(upper) || /\bMULTIPLE SUBTITLE\b/.test(upper))
    tags.push({ code: "multi", label: "Multi" });

  if (/\bDUAL[- ]?AUDIO\b/.test(upper)) tags.push({ code: "dual", label: "Dual" });

  for (const [key, label] of Object.entries(LANG_CODE_MAP)) {
    if (tags.some((t) => t.label === label)) continue;
    const pattern = new RegExp(`\\b${key.replace("-", "[- ]?")}\\b`);
    if (pattern.test(upper)) tags.push({ code: key, label });
  }

  return tags;
}

export function formatSize(size: string): string {
  const match = size.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return size;
  const num = Number(match[1]);
  const unit = match[2];
  const text = Number.isInteger(num) ? String(num) : num.toFixed(2);
  return `${text} ${unit}`.trim();
}

export const parseSize = (s: string): number => {
  const normalized = s
    .replace("КБ", "KB")
    .replace("МБ", "MB")
    .replace("ГБ", "GB")
    .replace("ТБ", "TB");
  const match = normalized.match(/^([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)?$/);
  if (!match) return 0;

  const num = Number(match[1]);
  const unit = match[2] ?? "B";

  return num * (SIZE_MULTIPLIERS[unit as keyof typeof SIZE_MULTIPLIERS] ?? 1);
};

export const qualityMatch = (title: string, quality: string): boolean => {
  const num = quality.replace("p", "").replace("P", "");
  return new RegExp(`\\b${num}p\\b`, "i").test(title);
};

export function parseReleaseDate(value: string | undefined): number {
  if (!value) return 0;
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return 0;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isNaN(time) ? 0 : time;
}

export function formatReleaseAge(value: string | undefined, now = Date.now()): string | null {
  const time = parseReleaseDate(value);
  if (!time) return null;
  const diffDays = Math.max(0, Math.floor((now - time) / 86_400_000));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1d";
  if (diffDays < 30) return `${diffDays}d`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
