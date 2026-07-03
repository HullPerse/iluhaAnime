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

export function formatTime(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface VttCue {
  start: number;
  end: number;
  text: string;
  settings?: string;
}

export function parseVTT(text: string) {
  const cues: VttCue[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const parts = line.split(/\s+-->\s+/);
      if (parts.length === 2) {
        const start = parseVTTTime(parts[0].trim().replace(",", "."));
        const settingsAndEnd = parts[1].trim().split(/\s+/);
        const end = parseVTTTime(settingsAndEnd[0].replace(",", "."));
        const settings = settingsAndEnd.slice(1).join(" ");
        i++;
        const cueLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
          cueLines.push(lines[i]);
          i++;
        }
        if (cueLines.length > 0) {
          cues.push({ start, end, text: cueLines.join("\n"), settings: settings || undefined });
        }
        continue;
      }
    }
    i++;
  }
  return cues;
}

function parseVTTTime(time: string): number {
  const p = time.split(":");
  if (p.length === 3)
    return parseInt(p[0]) * 3600 + parseInt(p[1]) + parseFloat(p[2]);
  if (p.length === 2) return parseInt(p[0]) * 60 + parseFloat(p[1]);
  return parseFloat(time);
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
