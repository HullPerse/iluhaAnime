import { RatioChart } from "@/components/shared/charts/ratio.chart";
import { formatLabels } from "@/config/system/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { formatCompact } from "@/lib/graphics/chartsFormat.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { statsTooltipRow } from "@/lib/anilist/statsTooltip.utils";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";
import type { StatsDrillData } from "@/types/core/overview.stats";

import { StatsCard } from "@/routes/components/anilist/stats/card.stats";

export function FormatsCard({
  model,
  onDrill,
}: {
  model: StatsOverviewModel;
  onDrill: (data: StatsDrillData) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <StatsCard title={t("anilist.stats.formats")}>
      <RatioChart
        data={model.formats.map((row) => ({
          key: row.format,
          label: t(toLocaleKey(formatLabels[row.format] ?? row.format)),
          value: row.count,
        }))}
        ariaLabel={t("anilist.stats.formats")}
        formatValue={(value) => formatCompact(value, locale)}
        tooltip={(datum) => ({
          title: datum.label,
          rows: [statsTooltipRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        onActivate={(index) => {
          const row = model.formats[index];
          if (row) {
            onDrill({
              title: `${t("anilist.stats.formats")} (${row.mediaIds.length})`,
              ids: row.mediaIds,
            });
          }
        }}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}
