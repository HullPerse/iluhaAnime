import { attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";
import * as z from "zod/mini";

const FONT_CACHE_KEY = "systemFontsCache";
const FONT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FontCacheSchema = z.compile(
  z.object({ fonts: z.array(z.string()), ts: z.number() })
);

export const readCachedFonts = (): string[] => {
  const [parsed, error] = attemptSync(() => {
    const raw = localStorage.getItem(FONT_CACHE_KEY);
    if (!raw) return null;
    const result = FontCacheSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    if (Date.now() - result.data.ts >= FONT_CACHE_TTL_MS) return null;
    return result.data.fonts;
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