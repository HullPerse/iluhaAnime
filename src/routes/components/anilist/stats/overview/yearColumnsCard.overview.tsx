import { ColumnChart } from "@/components/shared/charts/column.chart";
import { useI18n } from "@/hooks/i18n.hook";
import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import { statsTooltipRow } from "@/lib/anilist/statsTooltip.utils";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";
import type { StatsDrillData } from "@/types/core/overview.stats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function YearColumnsCard({
  title,
  rows,
  onDrill,
}: {
  title: string;
  rows: StatsOverviewModel["startYears"];
  onDrill: (data: StatsDrillData) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <StatsCard title={title}>
      <ColumnChart
        data={rows.map((row) => ({
          key: `year-${row.year}`,
          label: String(row.year),
          value: row.count,
        }))}
        ariaLabel={title}
        formatValue={(value) => formatCompact(value, locale)}
        tooltip={(datum) => ({
          title: datum.label,
          rows: [statsTooltipRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        onActivate={(index) => {
          const row = rows[index];
          if (row) {
            onDrill({ title: `${title} (${row.mediaIds.length})`, ids: row.mediaIds });
          }
        }}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}
