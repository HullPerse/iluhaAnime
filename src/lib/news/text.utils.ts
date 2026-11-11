import type { NewsBlock } from "@/types/news/news";

/** Collapses blocks into one plain line for card previews. */
export function excerptOf(blocks: readonly NewsBlock[], limit = 260): string {
  const text = blocks
    .map((block) => block.runs.map((run) => run.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
}
