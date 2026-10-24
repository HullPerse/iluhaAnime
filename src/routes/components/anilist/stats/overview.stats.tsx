import type { ReactNode } from "react";
import { useMemo } from "react";

import { AnimatedNumber } from "@/components/shared/animatedNumber.component";
import { BarChart } from "@/components/shared/charts/bar.chart";
import { TabLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { ColumnChart } from "@/components/shared/charts/column.chart";
import { RatioChart } from "@/components/shared/charts/ratio.chart";
import { formatLabels, listStatusLabels } from "@/config/anilist/labels.config";
import { useAnilistStatistics } from "@/hooks/anilist/stats.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { formatMeanScore } from "@/lib/anilist/score.utils";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import { buildStatsOverview } from "@/lib/anilist/stats.utils";
import type { StatsOverviewModel } from "@/lib/anilist/stats.utils";
import { formatCompact, formatPercent } from "@/lib/charts/format.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { formatDistanceToNowOwn } from "@/lib/utils/distance.utils";
import type { AniListCollection } from "@/types/anilist";

import { StatsCard } from "./card.stats";

export interface StatsDrillData {
  title: string;
  ids: number[];
}

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="windows95-border bg-surface flex min-w-24 flex-1 flex-col gap-0.5 px-2 py-1">
      <span className="text-hint windows95-font text-xs">{label}</span>
      <span className="windows95-text text-sm font-bold tabular-nums">{children}</span>
    </div>
  );
}

function KpiStrip({
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
          <AnimatedNumber value={model.kpi.completionRate} format={(v) => formatPercent(v, locale)} />
        )}
      </Kpi>
    </div>
  );
}

function titlesRow(count: number, label: string, locale: ReturnType<typeof useI18n>["locale"]) {
  return { label, value: formatCompact(count, locale) };
}

function ScoreCard({
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
          rows: [titlesRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}

function StatusCard({ model }: { model: StatsOverviewModel }) {
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
          rows: [titlesRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}

function FormatsCard({
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
          rows: [titlesRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
        })}
        onActivate={(index) => {
          const row = model.formats[index];
          if (row) {
            onDrill({ title: `${t("anilist.stats.formats")} (${row.mediaIds.length})`, ids: row.mediaIds });
          }
        }}
        emptyLabel={t("anilist.stats.drill.empty")}
      />
    </StatsCard>
  );
}

function YearColumnsCard({
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
          rows: [titlesRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
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

function GenresCard({
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
              titlesRow(datum.value, t("anilist.stats.kpi.titles"), locale),
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

function StudiosCard({
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
          rows: [titlesRow(datum.value, t("anilist.stats.kpi.titles"), locale)],
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

function CompletionCard({ model }: { model: StatsOverviewModel }) {
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

/**
 * The statistics Overview: a KPI strip plus eight chart blocks fed by one
 * AniList statistics request and the cached list payload. Owns the loading,
 * error, empty and stale states.
 */
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
  const { statistics, isLoading, isFetching, error, updatedAt, retry } = useAnilistStatistics(userId);
  const model = useMemo(
    () => (statistics == null ? null : buildStatsOverview({ statistics, lists, scoreFormat })),
    [statistics, lists, scoreFormat]
  );

  if (userId == null || error != null) {
    return (
      <StatsCard title={t("anilist.stats.title")}>
        <div className="flex h-40 items-center justify-center gap-2">
          <span className="text-hint windows95-font text-xs">{error ?? t("anilist.stats.error")}</span>
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
            ? t("anilist.stats.updated", { time: formatDistanceToNowOwn(new Date(updatedAt), locale) })
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
