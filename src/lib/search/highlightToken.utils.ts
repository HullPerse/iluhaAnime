import type { HighlightToken } from "@/types/core/highlight";

export const highlightTokenKey = (
  segment: HighlightToken,
  index: number,
  seen: Map<string, number>
): string | number => {
  if (!segment.highlighted) return index;
  const base = `spell:${segment.kind ?? "match"}:${segment.text}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}#${count}`;
};
