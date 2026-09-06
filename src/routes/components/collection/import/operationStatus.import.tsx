import ProgressBar from "@/components/shared/progress.component";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";

export function OperationStatus({
  running,
  processed,
  total,
  current,
  doneLabel,
  doneCount,
  failures,
}: {
  running: boolean;
  processed: number;
  total: number;
  current: string | null;
  doneLabel: TranslationKey;
  doneCount: number | null;
  failures: Array<{ id: string; title: string }>;
}) {
  const { t } = useI18n();
  const finished = !running && doneCount !== null;
  return (
    <>
      {(running || finished) && (
        <div className="flex flex-col gap-1">
          {running && current ? (
            <span className="windows95-text truncate text-xs font-bold" title={current}>
              {t("collection.import.anilist.current", { title: current })}
            </span>
          ) : null}
          <ProgressBar value={running ? processed : total} max={Math.max(total, 1)} />
          <span className="windows95-text text-hint text-xs">
            {running ? `${processed}/${total}` : t(doneLabel, { count: doneCount ?? 0 })}
          </span>
        </div>
      )}
      {!running && failures.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="windows95-text text-destructive text-xs font-bold">
            {t("collection.import.anilist.failed", { count: failures.length })}
          </span>
          <ul className="windows95-border flex max-h-32 flex-col gap-1 overflow-auto bg-white p-1">
            {failures.map((f) => (
              <li key={f.id} className="windows95-text truncate text-xs" title={f.title}>
                {f.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
