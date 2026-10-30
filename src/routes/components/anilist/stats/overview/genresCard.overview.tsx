import { BarChart } from "@/components/shared/charts/bar.chart";
import { useI18n } from "@/hooks/i18n.hook";
import { formatMeanScore } from "@/lib/anilist/anilistScore.utils";
import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import { statsTooltipRow } from "@/lib/anilist/statsTooltip.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";
import type { StatsDrillData } from "@/types/core/overview.stats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function GenresCard({
  model,
  scoreFormat,
  onDrill,
}: {
  model: StatsOverviewModel;
  scoreFormat: AnilistScoreFormat;
  onDrill: (data: StatsDrillData) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <StatsCard title={t("anilist.stats.top.genres")}>
      <BarChart
        data={model.genres.map((row) => ({ key: row.genre, label: row.genre, value: row.count }))}
        ariaLabel={t("anilist.stats.top.genres")}
        formatValue={(value) => formatCompact(value, locale)}
        tooltip={(datum, index) => {
          const row = model.genres[index];
          return {
            title: datum.label,
            rows: [
              statsTooltipRow(datum.value, t("anilist.stats.kpi.titles"), locale),
              {
                label: t("anilist.stats.kpi.mean"),
                value: (row && formatMeanScore(row.meanScore, scoreFormat)) ?? "-",
              },
              {
                label: t("anilist.stats.kpi.hours"),
                value: formatCompact(Math.round((row?.minutes ?? 0) / 60), locale),
              },
            ],
          };
        }}
        onActivate={(index) => {
          const row = model.genres[index];
          if (row) {
            onDrill({ title: `${row.genre} (${row.mediaIds.length})`, ids: row.mediaIds });
          }
        }}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}
