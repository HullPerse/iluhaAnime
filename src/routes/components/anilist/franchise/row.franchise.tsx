import { cn } from "cn";

import { useI18n } from "@/hooks/i18n.hook";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { rowMeta } from "@/lib/anilist/franchiseRow.utils";
import { availableEpisodes } from "@/lib/anilist/franchise.utils";
import { formatEntryScore } from "@/lib/anilist/anilistScore.utils";
import { listStatusLabels } from "@/config/system/labels.config";
import type { EntryListInfo } from "@/types/anilist/entries";
import type { FranchiseNode } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";

import { FranchisePoster } from "./poster.franchise";
import { FranchiseMeta } from "./meta.franchise";
import { FranchiseProgress } from "./progress.franchise";

export function FranchiseRow({
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
  let shownProgress: number | null = null;
  if (progress != null && aired > 0) shownProgress = Math.min(progress, aired);
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
