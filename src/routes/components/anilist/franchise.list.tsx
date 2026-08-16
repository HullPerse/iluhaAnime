import { FILTER_LABELS } from "@/config/anilist.config";
import { groupFranchiseNodes } from "@/lib/anilist.utils";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import type { FranchiseNode } from "@/types/anilist";

interface FranchiseListProps {
  nodes: FranchiseNode[];
  animeId: number;
  relationMap: Map<number, string>;
  searchMatchIds: Set<number> | null;
  onNodeClick: (nodeId: number) => void;
}

function FranchiseList({
  nodes,
  animeId,
  relationMap,
  searchMatchIds,
  onNodeClick,
}: FranchiseListProps) {
  const { t } = useI18n();
  const root = nodes.find((node) => node.id === animeId);
  const rest = nodes.filter((node) => node.id !== animeId);
  const groups = groupFranchiseNodes(rest, relationMap);

  return (
    <div className="h-full w-full overflow-y-auto">
      {root && (
        <div className="sticky top-0 z-10 bg-white/95">
          <div className="windows95-text flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wide">
            {t("anilist.franchise.current")}
          </div>
          <button
            type="button"
            aria-label={root.title}
            onClick={() => onNodeClick(root.id)}
            className="windows95-text hover:bg-secondary/20 flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-[10px]"
            title={`${root.title} (${root.year ?? "?"}) · ${root.score ?? "—"} · ${root.format ?? ""}`}
          >
            {root.cover_url && (
              <img
                src={root.cover_url}
                alt=""
                className="windows95-border h-8 w-6 shrink-0 object-cover"
                loading="lazy"
              />
            )}
            <div className="flex min-w-0 flex-col items-start">
              <span className="w-full truncate">{root.title}</span>
              <span className="text-muted">
                {root.year ?? "?"}
                {root.format ? ` · ${root.format}` : ""}
                {root.score == null ? "" : ` · ${root.score}`}
              </span>
            </div>
          </button>
        </div>
      )}
      {groups.map(({ group, items }) => (
        <div key={group}>
          <div className="windows95-text bg-secondary/10 flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wide">
            {t(FILTER_LABELS[group] as never)}
            <span className="text-muted">({items.length})</span>
          </div>
          {items.map((node) => {
            const dimmed =
              searchMatchIds !== null && !searchMatchIds.has(node.id);
            return (
              <button
                type="button"
                key={node.id}
                aria-label={node.title}
                onClick={() => onNodeClick(node.id)}
                className={cn(
                  "windows95-text hover:bg-secondary/20 flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-[10px] transition-opacity duration-300",
                  dimmed && "opacity-30"
                )}
                title={`${node.title} (${node.year ?? "?"}) · ${node.score ?? "—"} · ${node.format ?? ""}`}
              >
                {node.cover_url && (
                  <img
                    src={node.cover_url}
                    alt=""
                    className="windows95-border h-8 w-6 shrink-0 object-cover"
                    loading="lazy"
                  />
                )}
                <div className="flex min-w-0 flex-col items-start">
                  <span className="w-full truncate">{node.title}</span>
                  <span className="text-muted">
                    {node.year ?? "?"}
                    {node.format ? ` · ${node.format}` : ""}
                    {node.score == null ? "" : ` · ${node.score}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { FranchiseList };