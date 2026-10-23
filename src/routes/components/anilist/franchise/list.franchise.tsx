import { cn } from "cn";
import { useEffect, useMemo, useRef } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { FILTER_LABELS } from "@/config/anilist/graph.config";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { getStatusColor, type EntryListInfo } from "@/lib/anilist/entries.utils";
import {
  availableEpisodes,
  buildFranchiseSections,
  franchiseSummary,
  pickNextToWatch,
} from "@/lib/anilist/franchise.utils";
import { formatShort } from "@/lib/anilist/graph.utils";
import { formatEntryScore } from "@/lib/anilist/score.utils";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { FranchiseListProps, FranchiseNode } from "@/types/anilist";

function rowMeta(node: FranchiseNode, ownScore: string | null, episodesShort: string): string {
  const parts: string[] = [node.year == null ? "?" : String(node.year)];
  if (node.format) parts.push(formatShort(node.format));
  if (node.episodes != null && node.episodes > 0) parts.push(`${node.episodes} ${episodesShort}`);
  if (node.score != null) parts.push(`★ ${node.score}`);
  if (ownScore) parts.push(ownScore);
  return parts.join(" - ");
}

function FranchisePoster({ url }: { url: string | null }) {
  if (!url) {
    return <span className="windows95-border bg-surface h-8 w-6 shrink-0" aria-hidden />;
  }
  return (
    <img
      src={url}
      alt=""
      className="windows95-border h-8 w-6 shrink-0 object-cover"
      loading="lazy"
    />
  );
}

function FranchiseMeta({
  entry,
  statusLabel,
  meta,
}: {
  entry: EntryListInfo | undefined;
  statusLabel: string | null;
  meta: string;
}) {
  if (!entry || !statusLabel) return <span className="text-hint">{meta}</span>;
  return (
    <span className="text-hint flex flex-wrap items-center gap-x-1">
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="windows95-border inline-block size-2.5 shrink-0"
          style={{ backgroundColor: getStatusColor(entry.list_status) }}
        />
        {statusLabel}
        <span aria-hidden>-</span>
      </span>
      <span>{meta}</span>
    </span>
  );
}

function FranchiseProgress({
  progress,
  aired,
  label,
  episodesShort,
}: {
  progress: number | null;
  aired: number;
  label: string;
  episodesShort: string;
}) {
  if (progress == null) return null;
  if (aired > 0) {
    const done = Math.min(progress, aired);
    return (
      <span className="flex items-center gap-1">
        <ProgressBar
          value={done}
          max={aired}
          className="inline-flex h-3.5 w-20"
          slots
          ariaLabel={label}
        />
        <span className="text-hint">
          {done}/{aired}
        </span>
      </span>
    );
  }
  if (progress <= 0) return null;
  return (
    <span className="text-hint">
      {progress} {episodesShort}
    </span>
  );
}

function FranchiseRow({
  node,
  index,
  entry,
  scoreFormat,
  isCurrent,
  isNext,
  dimmed,
  now,
  rowRef,
  onOpen,
}: {
  node: FranchiseNode;
  index?: number;
  entry: EntryListInfo | undefined;
  scoreFormat?: AnilistScoreFormat | null;
  isCurrent: boolean;
  isNext: boolean;
  dimmed: boolean;
  now: number;
  rowRef?: (element: HTMLButtonElement | null) => void;
  onOpen: (id: number) => void;
}) {
  const { t } = useI18n();
  const statusLabel = entry
    ? t(toLocaleKey(listStatusLabels[entry.list_status] ?? entry.list_status))
    : null;
  const ownScore = entry && scoreFormat ? formatEntryScore(entry.score, scoreFormat) : null;
  const meta = rowMeta(
    node,
    ownScore ? t("anilist.franchise.my.score", { score: ownScore }) : null,
    t("anilist.details.eps.short")
  );
  const progress = entry?.progress ?? null;
  const aired = availableEpisodes(node, now);
  const notReleased = node.status === "NOT_YET_RELEASED";
  const shownProgress = progress == null ? null : aired > 0 ? Math.min(progress, aired) : null;
  const accessible = [
    node.title,
    notReleased ? t("anilist.franchise.not.released") : null,
    statusLabel,
    shownProgress != null ? `${shownProgress}/${aired}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <button
      type="button"
      ref={rowRef}
      aria-label={accessible}
      onClick={() => {
        if (isCurrent) return;
        onOpen(node.id);
      }}
      className={cn(
        "windows95-text hover:bg-secondary/20 flex w-full items-start gap-2 px-2 py-1 text-left text-xs transition-opacity duration-300",
        isCurrent ? "cursor-default" : "cursor-pointer",
        dimmed && "opacity-30"
      )}
    >
      {index != null ? (
        <span className="text-hint w-4 shrink-0 text-right tabular-nums">{index}</span>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <FranchisePoster url={node.cover_url} />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="flex w-full min-w-0 items-center gap-1">
          <span className="min-w-0 truncate">{node.title}</span>
          {notReleased && (
            <span className="windows95-border text-hint shrink-0 px-1 text-xs leading-4">
              {t("anilist.franchise.not.released")}
            </span>
          )}
          {isCurrent && (
            <span className="bg-secondary text-title-text shrink-0 px-1 text-xs leading-4">
              {t("anilist.franchise.current")}
            </span>
          )}
          {isNext && (
            <span className="windows95-border bg-field shrink-0 px-1 text-xs leading-4">
              {t("anilist.franchise.next")}
            </span>
          )}
        </span>
        <FranchiseMeta entry={entry} statusLabel={statusLabel} meta={meta} />
        <FranchiseProgress
          progress={progress}
          aired={aired}
          label={t("anilist.franchise.progress", { done: shownProgress ?? 0, total: aired })}
          episodesShort={t("anilist.details.eps.short")}
        />
      </span>
    </button>
  );
}

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
