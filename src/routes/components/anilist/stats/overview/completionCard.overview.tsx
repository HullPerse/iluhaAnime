import { BarChart } from "@/components/shared/charts/bar.chart";
import { useI18n } from "@/hooks/i18n.hook";
import { formatPercent } from "@/lib/graphics/chartsFormat.utils";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function CompletionCard({ model }: { model: StatsOverviewModel }) {
  const { t, locale } = useI18n();
  return (
    <StatsCard title={t("anilist.stats.completion")}>
      <BarChart
        data={model.completion.map((row) => ({
          key: row.genre,
          label: row.genre,
          value: row.rate,
        }))}
        ariaLabel={t("anilist.stats.completion")}
        formatValue={(value) => formatPercent(value, locale)}
        tooltip={(datum, index) => {
          const row = model.completion[index];
          return {
            title: datum.label,
            rows: [
              { label: t("anilist.stats.tooltip.started"), value: String(row?.started ?? 0) },
              { label: t("anilist.stats.tooltip.completed"), value: String(row?.completed ?? 0) },
            ],
          };
        }}
        emptyLabel={t("anilist.stats.completion.empty")}
      />
    </StatsCard>
  );
}
