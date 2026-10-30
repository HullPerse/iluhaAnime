import { formatShort } from "@/lib/graphics/graph.utils";
import type { FranchiseNode } from "@/types/anilist/anilist";

export function rowMeta(
  node: FranchiseNode,
  ownScore: string | null,
  episodesShort: string
): string {
  const parts: string[] = [node.year == null ? "?" : String(node.year)];
  if (node.format) parts.push(formatShort(node.format));
  if (node.episodes != null && node.episodes > 0) parts.push(`${node.episodes} ${episodesShort}`);
  if (node.score != null) parts.push(`?: ${node.score}`);
  if (ownScore) parts.push(ownScore);
  return parts.join(" - ");
}
