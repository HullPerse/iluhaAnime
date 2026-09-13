import { FILTER_KEYS } from "@/lib/search/intent.utils";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

export function buildCollectionQueryHints(
  items: CollectionItem[],
  statuses: CollectionStatusDef[]
): Array<{ kind: "local"; value: string }> {
  const hints: Array<{ kind: "local"; value: string }> = [];
  const push = (value: string) => hints.push({ kind: "local", value });
  const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value);
  push("source=anilist");
  push("source=tmdb");
  push("source=custom");
  push("type=anime");
  push("type=movie");
  push("type=series");
  push("type=custom");
  for (const s of statuses) push(`status=${s.id}`);
  for (const p of ["low", "normal", "high"] as const) push(`priority=${p}`);
  for (const key of Object.keys(FILTER_KEYS)) push(`${key}=`);
  for (const by of ["date", "name", "rating", "year"] as const) push(`sort=${by}`);
  for (const provider of ["anilist", "tmdb", "custom"] as const) push(`provider=${provider}`);
  const studios = new Set<string>();
  const genres = new Set<string>();
  const years = new Set<string>();
  const ratings = new Set<string>();
  for (const item of items) {
    if (item.studio) studios.add(item.studio);
    for (const g of item.genres) if (g) genres.add(g);
    if (item.year != null) years.add(String(item.year));
    if (item.rating != null) ratings.add(String(item.rating));
  }
  for (const v of studios) push(`studio=${quote(v)}`);
  for (const v of genres) push(`genre=${quote(v)}`);
  for (const v of years) push(`year=${v}`);
  for (const v of ratings) push(`rating=${v}`);
  return hints;
}
