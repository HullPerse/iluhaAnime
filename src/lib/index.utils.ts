import { LanguageTag } from "@/types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Update, check } from "@tauri-apps/plugin-updater";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function detectLanguages(title: string): LanguageTag[] {
  const tags: LanguageTag[] = [];
  const upper = title.toUpperCase();

  if (/\bRUS\b/.test(upper) || /\bRU\b/.test(upper) || /\[Рус\]/.test(title))
    tags.push({ code: "ru", label: "RU" });

  if (/\bENG\b/.test(upper) || /\bEN\b/.test(upper))
    tags.push({ code: "en", label: "EN" });

  if (/\bMULTISUB\b/.test(upper) || /\bMULTIPLE SUBTITLE\b/.test(upper))
    tags.push({ code: "multi", label: "Multi" });

  if (/\bDUAL[- ]?AUDIO\b/.test(upper))
    tags.push({ code: "dual", label: "Dual" });

  const langMap: Record<string, string> = {
    "POR-BR": "PT",
    POR: "PT",
    "SPA-LA": "ES",
    SPA: "ES",
    FRE: "FR",
    FR: "FR",
    GER: "DE",
    DE: "DE",
    ITA: "IT",
    JPN: "JP",
    JP: "JP",
    CHI: "ZH",
    KOR: "KO",
    ARA: "AR",
    THA: "TH",
    VIE: "VI",
  };

  for (const [key, label] of Object.entries(langMap)) {
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
  const num = parseFloat(match[1]);
  const unit = match[2] || "B";
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    KiB: 1024,
    MB: 1048576,
    MiB: 1048576,
    GB: 1073741824,
    GiB: 1073741824,
  };
  return num * (multipliers[unit] || 1);
};

export const qualityMatch = (title: string, quality: string): boolean => {
  const num = quality.replace("p", "").replace("P", "");
  return new RegExp(`\\b${num}p\\b`, "i").test(title);
};

export async function installUpdate(update: Update) {
  if (!update) return;
  try {
    await update.downloadAndInstall();
  } catch (e) {
    console.error("Failed to install update:", e);
  }
}

export async function checkForUpdates(): Promise<Update | null> {
  try {
    return await check();
  } catch (e) {
    console.debug("Auto-update check skipped:", e);
    return null;
  }
}
