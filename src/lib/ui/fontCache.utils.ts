import { attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";

const FONT_CACHE_KEY = "systemFontsCache";
const FONT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const readCachedFonts = (): string[] => {
  const [parsed, error] = attemptSync(() => {
    const raw = localStorage.getItem(FONT_CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { fonts: string[]; ts: number };
    if (
      Array.isArray(value.fonts) &&
      typeof value.ts === "number" &&
      Date.now() - value.ts < FONT_CACHE_TTL_MS
    )
      return value.fonts;
    return null;
  });
  if (error) reportBackgroundError("fonts.cache.parse", error);
  return parsed ?? [];
};

export const writeCachedFonts = (fonts: string[]): void => {
  const [, error] = attemptSync(() =>
    localStorage.setItem(FONT_CACHE_KEY, JSON.stringify({ fonts, ts: Date.now() }))
  );
  if (error) reportBackgroundError("fonts.cache.write", error);
};
