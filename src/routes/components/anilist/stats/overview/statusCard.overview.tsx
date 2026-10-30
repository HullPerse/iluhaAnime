import { RatioChart } from "@/components/shared/charts/ratio.chart";
import { listStatusLabels } from "@/config/system/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { statsTooltipRow } from "@/lib/anilist/statsTooltip.utils";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function StatusCard({ model }: { model: StatsOverviewModel }) {
  const { t, locale } = useI18n();
  return (
    <StatsCard title={t("anilist.stats.status")}>
      <RatioChart
        data={model.statuses.map((row) => ({
          key: row.status,
          label: t(toLocaleKey(listStatusLabels[row.status] ?? row.status)),
          value: row.count,
          color: getStatusColor(row.status),
        }))}
        ariaLabel={t("anilist.stats.status")}
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
