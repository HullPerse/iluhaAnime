import { parseMediaFile } from "@/lib/search/parse.utils";
import type { Anime, BatchGroup } from "@/types/torrent/torrent";

function norm(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/gu, " ");
}

function seasonFromTitle(raw: string): number | undefined {
  const match =
    /\bS(\d{1,2})\b/i.exec(raw) ??
    /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i.exec(raw) ??
    /\bseason\s*(\d{1,2})\b/i.exec(raw);
  if (!match?.[1]) return undefined;
  const season = Number.parseInt(match[1], 10);
  return Number.isFinite(season) && season > 0 ? season : undefined;
}

export function batchEpisodeNumber(item: Anime): number | undefined {
  return parseMediaFile(null, item.title).episode.number;
}

export function groupBatchResults(items: Anime[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const item of items) {
    const parsed = parseMediaFile(null, item.title);
    const title = parsed.title.trim() || item.title.trim();
    const group = parsed.groups[0]?.trim() ?? "";
    const season = parsed.season ?? seasonFromTitle(item.title);
    const key = `${group.toLowerCase()}|${norm(title)}|${season ?? 1}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(key, { key, title, group, ...(season === undefined ? {} : { season }), items: [item] });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    items: [...group.items].sort((a, b) => {
      const left = batchEpisodeNumber(a);
      const right = batchEpisodeNumber(b);
      if (left === undefined && right === undefined) return 0;
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      return left - right;
    }),
  }));
}
