import { LanguageTag } from "@/types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
