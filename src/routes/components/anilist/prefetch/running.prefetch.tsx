import ProgressBar from "@/components/shared/progress.component";
import { formatClock } from "@/lib/utils/time.utils";
import type { ActivityTranslate, PrefetchProgressPayload } from "@/types/anilist";

export function RunningSummary({
  progress,
  t,
}: {
  progress: PrefetchProgressPayload;
  t: ActivityTranslate;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ProgressBar value={progress.done} max={progress.total} />
      <div className="windows95-text flex flex-row items-center justify-between text-xs">
        <span>
          {t("anilist.prefetch.done")}: {progress.done} / {progress.total}
        </span>
        <span>
          {t("anilist.prefetch.remaining")}: {progress.remaining}
        </span>
      </div>
      <div className="windows95-text text-hint text-xs">
        {t("anilist.prefetch.fetched")}: {progress.fetched} - {t("anilist.prefetch.skipped")}:{" "}
        {progress.skipped}
        {progress.current ? (
          <>
            {" "}
            - {t("anilist.prefetch.current")}: <strong>{progress.current}</strong>
          </>
        ) : null}
      </div>
      <div className="windows95-text text-hint flex flex-row items-center justify-between text-xs">
        <span>
          {t("anilist.prefetch.time")}: {formatClock(progress.elapsed_ms / 1000)}
        </span>
        <span>
          {t("anilist.prefetch.eta")}: ~
          {progress.eta_secs == null ? "..." : formatClock(progress.eta_secs)}
        </span>
        <span>
          {t("anilist.prefetch.next.batch")}: {(progress.next_batch_in_ms / 1000).toFixed(1)}с
        </span>
      </div>
    </div>
  );
}
