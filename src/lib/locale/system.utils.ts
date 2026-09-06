import type { Locale } from "@/types";

export function detectSystemLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const preferred = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language];
  return preferred.some((lang) => typeof lang === "string" && /^ru\b/i.test(lang)) ? "ru" : "en";
}
