import { parseMediaFile } from "@/lib/search/parse.utils";
import type { Anime } from "@/types/torrent/torrent";

export interface BatchGroup {
  key: string;
  title: string;
  group: string;
  items: Anime[];
}

export function groupBatchResults(items: Anime[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const item of items) {
    const parsed = parseMediaFile(null, item.title);
    const title = parsed.title.trim() || item.title.trim();
    const group = parsed.groups[0]?.trim() ?? "";
    const key = `${title.toLowerCase()}|${group.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, { key, title, group, items: [item] });
  }
  return [...groups.values()].filter((entry) => entry.items.length > 0);
}
