import { useMemo } from "react";

import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { useAnilistStatistics } from "@/hooks/anilist/stats.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { buildStatsOverview } from "@/lib/anilist/anilistStats.utils";
import { formatDistanceToNowOwn } from "@/lib/core/distance.utils";
import type { AniListCollection } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsDrillData } from "@/types/core/overview.stats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";
import { CompletionCard } from "@/routes/components/anilist/stats/overview/completionCard.overview";
import { FormatsCard } from "@/routes/components/anilist/stats/overview/formatsCard.overview";
import { GenresCard } from "@/routes/components/anilist/stats/overview/genresCard.overview";
import { KpiStrip } from "@/routes/components/anilist/stats/overview/kpiStrip.overview";
import { ScoreCard } from "@/routes/components/anilist/stats/overview/scoreCard.overview";
import { StatusCard } from "@/routes/components/anilist/stats/overview/statusCard.overview";
import { StudiosCard } from "@/routes/components/anilist/stats/overview/studiosCard.overview";
import { YearColumnsCard } from "@/routes/components/anilist/stats/overview/yearColumnsCard.overview";

export function StatsOverview({
  userId,
  scoreFormat,
  lists,
  onDrill,
}: {
  userId: number | null;
  scoreFormat: AnilistScoreFormat;
  lists: AniListCollection[];
  onDrill: (data: StatsDrillData) => void;
}) {
  const { t, locale } = useI18n();
  const { statistics, isLoading, isFetching, error, updatedAt, retry } =
    useAnilistStatistics(userId);
  const model = useMemo(
    () => (statistics == null ? null : buildStatsOverview({ statistics, lists, scoreFormat })),
    [statistics, lists, scoreFormat]
  );

  if (userId == null || error != null) {
    return (
      <StatsCard title={t("anilist.stats.title")}>
        <div className="flex h-40 items-center justify-center gap-2">
          <span className="text-hint windows95-font text-xs">
            {error ?? t("anilist.stats.error")}
          </span>
          {userId != null && (
            <Button className="h-5 text-xs" disabled={isFetching} onClick={retry}>
              {t("anilist.stats.refresh")}
            </Button>
          )}
        </div>
      </StatsCard>
    );
  }
  if (isLoading || model == null) {
    return <TabLoader className="min-h-40" />;
  }
  if (model.isEmpty) {
    return (
      <StatsCard title={t("anilist.stats.title")}>
        <p className="text-hint windows95-font p-4 text-xs">{t("anilist.stats.empty")}</p>
      </StatsCard>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-hint windows95-font min-w-0 truncate text-xs">
          {updatedAt > 0
            ? t("anilist.stats.updated", {
                time: formatDistanceToNowOwn(new Date(updatedAt), locale),
              })
            : null}
        </span>
        <Button className="h-5 text-xs" disabled={isFetching} onClick={retry}>
          {t("anilist.stats.refresh")}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <KpiStrip model={model} scoreFormat={scoreFormat} />
        </div>
        <div className="col-span-2">
          <ScoreCard model={model} scoreFormat={scoreFormat} />
        </div>
        <div className="col-span-1">
          <StatusCard model={model} />
        </div>
        <div className="col-span-1">
          <FormatsCard model={model} onDrill={onDrill} />
        </div>
        <div className="col-span-1">
          <YearColumnsCard
            title={t("anilist.stats.years.watched")}
            rows={model.startYears}
            onDrill={onDrill}
          />
        </div>
        <div className="col-span-1">
          <YearColumnsCard
            title={t("anilist.stats.years.released")}
            rows={model.releaseYears}
            onDrill={onDrill}
          />
        </div>
        <div className="col-span-1">
          <GenresCard model={model} scoreFormat={scoreFormat} onDrill={onDrill} />
        </div>
        <div className="col-span-1">
          <StudiosCard model={model} onDrill={onDrill} />
        </div>
        <div className="col-span-2">
          <CompletionCard model={model} />
        </div>
      </div>
    </div>
  );
}
