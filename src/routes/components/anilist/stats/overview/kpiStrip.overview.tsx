import { AnimatedNumber } from "@/components/shared/animatedNumber.component";
import { formatCompact, formatPercent } from "@/lib/graphics/chartsFormat.utils";
import { formatMeanScore } from "@/lib/anilist/anilistScore.utils";
import { useI18n } from "@/hooks/i18n.hook";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { StatsOverviewModel } from "@/types/anilist/anilistStats";

import { Kpi } from "@/routes/components/anilist/stats/overview/kpi.overview";

export function KpiStrip({
  model,
  scoreFormat,
}: {
  model: StatsOverviewModel;
  scoreFormat: AnilistScoreFormat;
}) {
  const { t, locale } = useI18n();
  const compact = (value: number) => formatCompact(Math.round(value), locale);
  return (
    <div className="flex flex-wrap gap-2">
      <Kpi label={t("anilist.stats.kpi.titles")}>
        <AnimatedNumber value={model.kpi.titles} format={compact} />
      </Kpi>
      <Kpi label={t("anilist.stats.kpi.episodes")}>
        <AnimatedNumber value={model.kpi.episodes} format={compact} />
      </Kpi>
      <Kpi label={t("anilist.stats.kpi.hours")}>
        <AnimatedNumber value={model.kpi.hours} format={compact} />
      </Kpi>
      <Kpi label={t("anilist.stats.kpi.mean")}>
        <AnimatedNumber
          value={model.kpi.mean}
          format={(v) => formatMeanScore(v, scoreFormat) ?? "-"}
        />
      </Kpi>
      <Kpi label={t("anilist.stats.kpi.completion")}>
        {model.kpi.completionRate == null ? (
          "-"
        ) : (
          <AnimatedNumber
            value={model.kpi.completionRate}
            format={(v) => formatPercent(v, locale)}
          />
        )}
      </Kpi>
    </div>
  );
}
