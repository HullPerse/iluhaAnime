import { useEffect, useMemo, useRef } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { FILTER_LABELS } from "@/config/graphics/graph.config";
import { useI18n } from "@/hooks/i18n.hook";
import {
  buildFranchiseSections,
  franchiseSummary,
  pickNextToWatch,
} from "@/lib/anilist/franchise.utils";
import type { FranchiseListProps } from "@/types/anilist/anilist";

import { FranchiseRow } from "@/routes/components/anilist/franchise/row.franchise";

function FranchiseList({
  nodes,
  edges,
  animeId,
  relationMap,
  mainlineIds,
  searchMatchIds,
  entryLookup,
  scoreFormat,
  onNodeClick,
}: FranchiseListProps) {
  const { t } = useI18n();
  const sections = useMemo(
    () => buildFranchiseSections(nodes, edges, mainlineIds, relationMap),
    [nodes, edges, mainlineIds, relationMap]
  );
  const mainline = useMemo(
    () => sections.find((section) => section.key === "mainline")?.items ?? [],
    [sections]
  );
  const now = Math.floor(Date.now() / 1000);
  const next = useMemo(
    () => pickNextToWatch(mainline, entryLookup, now),
    [mainline, entryLookup, now]
  );
  const summary = useMemo(
    () => franchiseSummary(nodes, entryLookup, now),
    [nodes, entryLookup, now]
  );

  const firstMatchId = useMemo(() => {
    if (!searchMatchIds) return null;
    for (const section of sections) {
      for (const node of section.items) {
        if (searchMatchIds.has(node.id)) return node.id;
      }
    }
    return null;
  }, [sections, searchMatchIds]);
  const firstMatchRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (firstMatchId == null) return;
    firstMatchRef.current?.scrollIntoView({ block: "nearest" });
  }, [firstMatchId]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="bg-field border-muted flex shrink-0 flex-col gap-1 border-b px-2 py-1">
        <div className="windows95-text flex flex-wrap items-center gap-x-2 text-xs">
          <span>
            {summary.episodes > 0
              ? t("anilist.franchise.summary", {
                  episodes: summary.episodes,
                  titles: summary.titles,
                })
              : t("anilist.franchise.summary.titles", { titles: summary.titles })}
          </span>
          {summary.percent != null && (
            <span className="text-hint">
              {t("anilist.franchise.summary.watched", {
                percent: summary.percent,
                watched: summary.watched,
              })}
            </span>
          )}
        </div>
        {summary.percent != null && summary.episodes > 0 && (
          <ProgressBar
            value={summary.watched}
            max={summary.episodes}
            className="h-2 w-full"
            ariaLabel={t("anilist.franchise.progress", {
              done: summary.watched,
              total: summary.episodes,
            })}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.map(({ key, items }) => (
          <div key={key}>
            <div className="windows95-text bg-secondary/10 flex items-center gap-1 px-2 py-0.5 text-xs tracking-wide uppercase">
              {key === "mainline" ? t("anilist.franchise.mainline") : t(FILTER_LABELS[key])}
              <span className="text-hint">({items.length})</span>
            </div>
            {items.map((node, index) => (
              <FranchiseRow
                key={node.id}
                node={node}
                index={key === "mainline" ? index + 1 : undefined}
                entry={entryLookup?.get(node.id)}
                scoreFormat={scoreFormat}
                isCurrent={node.id === animeId}
                isNext={next?.id === node.id}
                dimmed={searchMatchIds !== null && !searchMatchIds.has(node.id)}
                now={now}
                rowRef={
                  node.id === firstMatchId
                    ? (element) => {
                        firstMatchRef.current = element;
                      }
                    : undefined
                }
                onOpen={onNodeClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export { FranchiseList };
