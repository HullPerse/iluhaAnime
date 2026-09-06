import { LANG_CODE_MAP } from "@/config/search/languages.config";
import { SIZE_MULTIPLIERS } from "@/config/search/sizes.config";
import type { LanguageTag } from "@/types";

export function detectLanguages(title: string): LanguageTag[] {
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
    if (upper.includes(key)) tags.push({ code: key, label });
  }

  return tags;
}

export function formatSize(size: string): string {
  const match = size.match(/^([\d.]+)\s*(.*)$/);
  if (!match) return size;
  const num = Number(match[1]);
  const unit = match[2];
  return `${num.toFixed(2)} ${unit}`.trim();
}

export const parseSize = (s: string): number => {
  const match = s.match(/^([\d.]+)\s*(B|KB|KiB|MB|MiB|GB|GiB)?$/);
  if (!match) return 0;

  const num = Number(match[1]);
  const unit = match[2] ?? "B";

  return num * (SIZE_MULTIPLIERS[unit as keyof typeof SIZE_MULTIPLIERS] ?? 1);
};

export const qualityMatch = (title: string, quality: string): boolean => {
  const num = quality.replace("p", "").replace("P", "");
  return new RegExp(`\\b${num}p\\b`, "i").test(title);
};
