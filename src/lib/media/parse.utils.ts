import { resolveMediaFile } from "@/lib/media/resolve.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";
import type { MediaFileParse } from "@/types/media";

const MAX_MEDIA_PARSE_CACHE = 8000;
const parseCache = createLruCache<string, MediaFileParse>(MAX_MEDIA_PARSE_CACHE);

export function parseMediaFile(dir: string | null, file: string): MediaFileParse {
  const key = `${dir ?? ""}\n${file}`;
  const cached = parseCache.get(key);
  if (cached !== undefined) return cached;
  const parsed = resolveMediaFile(dir, file);
  parseCache.set(key, parsed);
  return parsed;
}

export function fileNameFromPath(p: string): string {
  const slash = p.lastIndexOf("/");
  const backslash = p.lastIndexOf("\\");
  const cut = Math.max(slash, backslash);
  if (cut === -1) return p;
  const name = p.slice(cut + 1);
  return name || p;
}

export function parseMediaPath(fullPath: string): MediaFileParse {
  const normalized = fullPath.replaceAll(/\\/g, "/");
  const cut = normalized.lastIndexOf("/");
  const file = cut === -1 ? normalized : normalized.slice(cut + 1);
  const dir = cut === -1 ? null : normalized.slice(0, cut) || null;
  return parseMediaFile(dir, file);
}

export function clearMediaParseCache(): void {
  parseCache.clear();
}
