import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";
import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { LanguageTag } from "@/types";

import type { TorrentTreeNode } from "./torrent.utils";

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
    ARA: "AR",
    CHI: "ZH",
    DE: "DE",
    FR: "FR",
    FRE: "FR",
    GER: "DE",
    ITA: "IT",
    JP: "JP",
    JPN: "JP",
    KOR: "KO",
    POR: "PT",
    "POR-BR": "PT",
    SPA: "ES",
    "SPA-LA": "ES",
    THA: "TH",
    VIE: "VI",
  };

  for (const [key, label] of Object.entries(langMap)) {
    if (tags.some((t) => t.label === label)) continue;
    if (upper.includes(key)) tags.push({ code: key, label });
  }

  return tags;
}

export function formatTime(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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
  const num = Number.parseFloat(match[1]);
  const unit = match[2] || "B";
  const multipliers: Record<string, number> = {
    B: 1,
    GB: 1073741824,
    GiB: 1073741824,
    KB: 1024,
    KiB: 1024,
    MB: 1048576,
    MiB: 1048576,
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
  } catch (error) {
    console.error("Failed to install update:", error);
  }
}

export async function checkForUpdates(): Promise<Update | null> {
  try {
    return await check();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function collectFileIndices(node: TorrentTreeNode): number[] {
  const indices = node.files.map((f) => f.index);
  for (const child of node.children) {
    indices.push(...collectFileIndices(child));
  }
  return indices;
}
