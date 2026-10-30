import { ColumnChart } from "@/components/shared/charts/column.chart";
import { useI18n } from "@/hooks/i18n.hook";
import { formatMeanScore } from "@/lib/anilist/anilistScore.utils";
import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import { statsTooltipRow } from "@/lib/anilist/statsTooltip.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function ScoreCard({
  model,
  scoreFormat,
}: {
  model: StatsOverviewModel;
  scoreFormat: AnilistScoreFormat;
}) {
  const { t, locale } = useI18n();
  const buckets = model.scores.buckets;
  if (buckets.length === 0) {
    return (
      <StatsCard title={t("anilist.stats.scores")}>
        <div className="text-hint windows95-font flex h-24 items-center justify-center text-xs">
          {t("anilist.stats.drill.empty")}
        </div>
      </StatsCard>
    );
  }
  const width = buckets[0]!.to - buckets[0]!.from;
  const count = buckets.length;
  const mean = formatMeanScore(model.scores.mean, scoreFormat) ?? "-";
  return (
    <StatsCard
      title={t("anilist.stats.scores")}
      hint={t("anilist.stats.tooltip.mean", { score: mean })}
    >
      <ColumnChart
        data={buckets.map((bucket) => ({
          key: bucket.key,
          label: bucket.label,
          value: bucket.count,
        }))}
        xDomain={[0, count]}
        reference={{
          value: model.scores.mean / width,
          label: t("anilist.stats.reference.mean"),
        }}
        band={{
          from: Math.max(0, (model.scores.mean - model.scores.sigma) / width),
          to: Math.min(count, (model.scores.mean + model.scores.sigma) / width),
        }}
        ariaLabel={t("anilist.stats.scores")}
        formatValue={(value) => formatCompact(value, locale)}
        tooltip={(datum) => ({
          title: datum.label,
          rows: [statsTooltipRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}
