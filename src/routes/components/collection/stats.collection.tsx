import { statusColorOf } from "@/lib/collection.utils";
import { calculateCollectionStats } from "@/lib/collectionStats.utils";
import { useI18n } from "@/lib/i18n";

import { useStatusLabel, useStatuses } from "./context.collection";

export type SectionStats = ReturnType<typeof calculateCollectionStats>;

export function CollectionStatisticsSection({
  stats,
}: {
  stats: SectionStats;
}) {
  const { t } = useI18n();
  const statuses = useStatuses();
  const statusLabel = useStatusLabel();
  return (
    <section className="windows95-border flex-1 overflow-y-auto bg-white p-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="windows95-active-border bg-primary p-2">
          <div className="text-hint text-xs">{t("collection.stats.total")}</div>
          <strong>{stats.total}</strong>
        </div>
        <div className="windows95-active-border bg-primary p-2">
          <div className="text-hint text-xs">
            {t("collection.stats.avgRating")}
          </div>
          <strong>{stats.avgRating ?? "-"}</strong>
        </div>
        <div className="windows95-active-border bg-primary p-2">
          <div className="text-hint text-xs">
            {t("collection.stats.hoursWatched")}
          </div>
          <strong>{stats.hours}h</strong>
        </div>
        <div className="windows95-active-border bg-primary p-2">
          <div className="text-hint text-xs">
            {t("collection.stats.favorites")}
          </div>
          <strong>{stats.favoriteCount}</strong>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
        {Object.entries(stats.byStatus).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1">
            <span
              className="windows95-border h-3 w-3"
              style={{ backgroundColor: statusColorOf(statuses, k) }}
            />
            {statusLabel(k)}: {v}
          </div>
        ))}
      </div>
      <RatingDistributionChart distribution={stats.ratingDistribution} />
      <PerYearHoursChart perYearHours={stats.perYearHours} />
      <div className="text-hint mt-4 text-xs">
        {t("collection.stats.hoursNote")}
      </div>
    </section>
  );
}

export function RatingDistributionChart({
  distribution,
}: {
  distribution: Record<number, number>;
}) {
  const { t } = useI18n();
  if (Object.keys(distribution).length === 0) return null;
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <div className="windows95-active-border bg-primary mt-2 p-2">
      <strong className="text-xs">
        {t("collection.stats.ratingDistribution")}
      </strong>
      <div className="mt-1 flex items-end gap-0.5" style={{ height: 60 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => {
          const count = distribution[r] ?? 0;
          return (
            <div
              key={r}
              className="flex flex-1 flex-col items-center gap-0.5"
              title={`${r}: ${count}`}
            >
              <div
                className="bg-secondary w-full"
                style={{
                  height: `${(count / max) * 40}px`,
                  minHeight: count > 0 ? 2 : 0,
                }}
              />
              <span className="text-xs">{r}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PerYearHoursChart({
  perYearHours,
}: {
  perYearHours: Record<number, number>;
}) {
  const { t } = useI18n();
  if (Object.keys(perYearHours).length === 0) return null;
  const maxH = Math.max(1, ...Object.values(perYearHours));
  return (
    <div className="windows95-active-border bg-primary mt-2 p-2">
      <strong className="text-xs">{t("collection.stats.perYearHours")}</strong>
      <div className="mt-1 flex flex-col gap-0.5">
        {Object.entries(perYearHours)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([year, h]) => (
            <div key={year} className="flex items-center gap-1 text-xs">
              <span className="text-hint w-10">{year}</span>
              <div className="windows95-border h-3 flex-1 overflow-hidden bg-white">
                <div
                  className="bg-secondary h-full"
                  style={{ width: `${(h / maxH) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right">{Math.round(h)}h</span>
            </div>
          ))}
      </div>
    </div>
  );
}
