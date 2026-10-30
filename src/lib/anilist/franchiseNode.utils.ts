import { FILTER_LABELS } from "@/config/graphics/graph.config";
import type { FranchiseNode } from "@/types/anilist/anilist";
import type { TFunc } from "@/types/core/i18n";

export const aggregateLabel = (node: FranchiseNode, t: TFunc): string => {
  if (!node.aggregate) return node.title;
  return `${t(FILTER_LABELS[node.aggregate.group])} +${node.aggregate.count}`;
};

export const nodeTooltip = (
  node: FranchiseNode,
  label: string,
  isAggregator: boolean,
  t: TFunc
): string => {
  if (isAggregator) return `${label} - ${t("anilist.franchise.expand")}`;
  return `${node.title} (${node.year ?? "?"}) - ${node.score ?? "-"} - ${node.format ?? ""}`;
};
