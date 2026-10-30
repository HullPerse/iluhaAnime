import { BarChart } from "@/components/shared/charts/bar.chart";
import { useI18n } from "@/hooks/i18n.hook";
import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import { statsTooltipRow } from "@/lib/anilist/statsTooltip.utils";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";
import type { StatsDrillData } from "@/types/core/overview.stats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function StudiosCard({
  model,
  onDrill,
}: {
  model: StatsOverviewModel;
  onDrill: (data: StatsDrillData) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <StatsCard title={t("anilist.stats.top.studios")}>
      <BarChart
        data={model.studios.map((row) => ({
          key: String(row.id),
          label: row.name,
          value: row.count,
        }))}
        ariaLabel={t("anilist.stats.top.studios")}
        formatValue={(value) => formatCompact(value, locale)}
        tooltip={(datum) => ({
          title: datum.label,
          rows: [statsTooltipRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        onActivate={(index) => {
          const row = model.studios[index];
          if (row) {
            onDrill({ title: `${row.name} (${row.mediaIds.length})`, ids: row.mediaIds });
          }
        }}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}
