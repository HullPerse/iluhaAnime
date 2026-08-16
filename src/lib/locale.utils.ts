import type { Locale } from "@/types";

/**
 * Resolve the interface language from the OS when the user has not chosen one:
 * Russian systems get "ru", everything else gets "en".
 */
export function detectSystemLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const preferred = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language];
  return preferred.some(
    (lang) => typeof lang === "string" && /^ru\b/i.test(lang)
  )
    ? "ru"
    : "en";
}
