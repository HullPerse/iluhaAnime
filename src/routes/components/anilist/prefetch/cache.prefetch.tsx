import { cn } from "cn";

import { getCachePercentages } from "@/lib/anilist/prefetch.utils";
import type { ActivityTranslate, PrefetchProgressPayload, PrefetchSummary } from "@/types/anilist";

export function CacheSummary({
  progress,
  finished,
  t,
}: {
  progress: PrefetchProgressPayload | null;
  finished: PrefetchSummary | null;
  t: ActivityTranslate;
}) {
  const { fetched, skipped, cached, fetchedPercent } = getCachePercentages(progress, finished);
  return progress || finished ? (
    <section className="windows95-active-border flex flex-col gap-1 bg-white p-1">
      <div className="windows95-text flex items-center justify-between text-xs font-bold">
        <span>{t("anilist.prefetch.cache.visual.title")}</span>
        <span className="text-hint">{cached}%</span>
      </div>
      <div className="windows95-border bg-surface flex h-3 gap-px overflow-hidden p-px">
        <div
          className="bg-secondary transition-[width] duration-300"
          style={{ width: `${fetchedPercent}%` }}
          title={t("anilist.prefetch.cache.fetched")}
        />
        <div
          className="bg-green-500 transition-[width] duration-300"
          style={{ width: `${cached}%` }}
          title={t("anilist.prefetch.cache.hit")}
        />
      </div>
      <div className="windows95-text grid grid-cols-3 gap-1 text-xs">
        <div className="bg-primary px-1 py-0.5">
          <div className="text-hint">{t("anilist.prefetch.cache.processed")}</div>
          <strong>{progress?.done ?? finished?.processed ?? 0}</strong>
        </div>
        <div className="bg-secondary/15 px-1 py-0.5">
          <div className="text-hint">{t("anilist.prefetch.cache.fetched")}</div>
          <strong>{fetched}</strong>
        </div>
        <div className="bg-green-100 px-1 py-0.5">
          <div className="text-hint">{t("anilist.prefetch.cache.hit")}</div>
          <strong>{skipped}</strong>
        </div>
      </div>
      {progress?.current && (
        <div className="windows95-text flex items-center gap-1 text-xs">
          <span className="bg-secondary inline-block size-1.5 animate-pulse rounded-full" />
          <span className="text-hint">{t("anilist.prefetch.cache.current")}</span>
          <span className="min-w-0 truncate font-bold">{progress.current}</span>
        </div>
      )}
      {progress?.items.length ? (
        <div className="flex flex-wrap gap-0.5">
          {progress.items.slice(-12).map((item) => (
            <span
              key={item.id}
              className={cn(
                "windows95-border max-w-35 truncate px-1 py-px text-xs",
                item.relations.length > 0 ? "bg-secondary/10 text-text" : "bg-surface text-hint"
              )}
              title={item.title}
            >
              {item.title}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  ) : null;
}
