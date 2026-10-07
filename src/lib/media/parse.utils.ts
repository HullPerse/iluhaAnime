import { resolveMediaFile } from "@/lib/media/resolve.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";
import type { MediaFileParse } from "@/types/media";

const MAX_MEDIA_PARSE_CACHE = 2000;
const parseCache = createLruCache<string, MediaFileParse>(MAX_MEDIA_PARSE_CACHE);

export function parseMediaFile(dir: string | null, file: string): MediaFileParse {
  const key = `${dir ?? ""}\n${file}`;
  const cached = parseCache.get(key);
  if (cached !== undefined) return cached;
  const parsed = resolveMediaFile(dir, file);
  parseCache.set(key, parsed);
  return parsed;
}

export function parseMediaPath(fullPath: string): MediaFileParse {
  const parts = fullPath.replaceAll(/\\/g, "/").split("/");
  const file = parts.pop() ?? fullPath;
  const dir = parts.length > 0 ? parts.join("/") : null;
  return parseMediaFile(dir, file);
}

export function clearMediaParseCache(): void {
  parseCache.clear();
}
