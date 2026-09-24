import { cn } from "cn";

import { FILTER_LABELS } from "@/config/anilist/graph.config";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { getStatusColor, type EntryListInfo } from "@/lib/anilist/entries.utils";
import { groupFranchiseNodes } from "@/lib/anilist/graph.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { FranchiseListProps, FranchiseNode } from "@/types/anilist";

function FranchiseRowBody({
  node,
  entry,
}: {
  node: FranchiseNode;
  entry: EntryListInfo | undefined;
}) {
  const { t } = useI18n();
  const statusLabel = entry
    ? t(toLocaleKey(listStatusLabels[entry.list_status] ?? entry.list_status))
    : null;
  const progress = entry?.progress ?? null;
  const total = node.episodes;
  const barPercent =
    progress != null && total != null && total > 0
      ? Math.min(100, Math.round((progress / total) * 100))
      : null;
  const countOnly = barPercent == null && progress != null && progress > 0;
  return (
    <div className="flex min-w-0 flex-col items-start">
      <span className="flex w-full min-w-0 items-center gap-1">
        {entry && (
          <span
            role="img"
            aria-label={statusLabel ?? entry.list_status}
            title={statusLabel ?? entry.list_status}
            className="windows95-border shrink-0"
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              backgroundColor: getStatusColor(entry.list_status),
            }}
          />
        )}
        <span className="w-full truncate">{node.title}</span>
      </span>
      <span className="text-hint">
        {node.year ?? "?"}
        {node.format ? ` - ${node.format}` : ""}
        {node.score == null ? "" : ` - ${node.score}`}
      </span>
      {barPercent != null && (
        <span className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="windows95-border bg-field relative inline-block h-3.5 w-20 overflow-hidden"
          >
            <span className="bg-secondary block h-full" style={{ width: `${barPercent}%` }} />
          </span>
          <span className="text-hint">
            {progress}/{total}
          </span>
        </span>
      )}
      {countOnly && <span className="bg-secondary text-title-text px-1">{progress}</span>}
    </div>
  );
}

function FranchiseList({
  nodes,
  animeId,
  relationMap,
  searchMatchIds,
  entryLookup,
  onNodeClick,
}: FranchiseListProps) {
  const { t } = useI18n();
  const root = nodes.find((node) => node.id === animeId);
  const rest = nodes.filter((node) => node.id !== animeId);
  const groups = groupFranchiseNodes(rest, relationMap);

  return (
    <div className="h-full w-full overflow-y-auto">
      {root && (
        <div className="bg-field/95 sticky top-0 z-10">
          <div className="windows95-text flex items-center gap-1 px-2 py-0.5 text-xs tracking-wide uppercase">
            {t("anilist.franchise.current")}
          </div>
          <button
            type="button"
            aria-label={root.title}
            onClick={() => onNodeClick(root.id)}
            className="windows95-text hover:bg-secondary/20 flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs"
            title={`${root.title} (${root.year ?? "?"}) - ${root.score ?? "-"} - ${root.format ?? ""}`}
          >
            {root.cover_url && (
              <img
                src={root.cover_url}
                alt=""
                className="windows95-border h-8 w-6 shrink-0 object-cover"
                loading="lazy"
              />
            )}
            <FranchiseRowBody node={root} entry={entryLookup?.get(root.id)} />
          </button>
        </div>
      )}
      {groups.map(({ group, items }) => (
        <div key={group}>
          <div className="windows95-text bg-secondary/10 flex items-center gap-1 px-2 py-0.5 text-xs tracking-wide uppercase">
            {t(FILTER_LABELS[group])}
            <span className="text-hint">({items.length})</span>
          </div>
          {items.map((node) => {
            const dimmed = searchMatchIds !== null && !searchMatchIds.has(node.id);
            return (
              <button
                type="button"
                key={node.id}
                aria-label={node.title}
                onClick={() => onNodeClick(node.id)}
                className={cn(
                  "windows95-text hover:bg-secondary/20 flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs transition-opacity duration-300",
                  dimmed && "opacity-30"
                )}
                title={`${node.title} (${node.year ?? "?"}) - ${node.score ?? "-"} - ${node.format ?? ""}`}
              >
                {node.cover_url && (
                  <img
                    src={node.cover_url}
                    alt=""
                    className="windows95-border h-8 w-6 shrink-0 object-cover"
                    loading="lazy"
                  />
                )}
                <FranchiseRowBody node={node} entry={entryLookup?.get(node.id)} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { FranchiseList };
