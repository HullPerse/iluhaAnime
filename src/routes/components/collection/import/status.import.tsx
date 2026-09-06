import ProgressBar from "@/components/shared/progress.component";
import { computeGroupProgress } from "@/lib/collection/importProgress.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { ImportBatchGroup } from "@/types/collection";

export function ImportStatusSection({
  importing,
  processed,
  result,
  failures,
  groups,
  profileTotal,
  current,
}: {
  importing: boolean;
  processed: number;
  result: { imported: number; skipped: number } | null;
  failures: Array<{ id: number; title: string }>;
  groups: ImportBatchGroup[];
  profileTotal: number;
  current: string | null;
}) {
  const { t } = useI18n();
  const scale = Math.max(profileTotal, 1);
  const groupDone = computeGroupProgress(groups, processed);
  return (
    <>
      {(importing || result) && (
        <div className="flex flex-col gap-1">
          {importing && current ? (
            <span className="windows95-text truncate text-xs font-bold" title={current}>
              {t("collection.import.anilist.current", { title: current })}
            </span>
          ) : null}
          {groups.map((group, index) => (
            <div key={group.name} className="grid grid-cols-[90px_1fr_110px] items-center gap-2">
              <span className="windows95-text truncate text-xs font-bold" title={group.name}>
                {group.name}
              </span>
              <ProgressBar value={groupDone[index] ?? 0} max={scale} className="h-4" />
              <span className="windows95-text text-hint text-right text-xs">
                {groupDone[index] ?? 0}/{profileTotal}
              </span>
            </div>
          ))}
          <ProgressBar value={importing ? processed : scale} max={scale} />
          <span className="windows95-text text-hint text-xs">
            {importing
              ? `${processed}/${profileTotal}`
              : t("collection.import.anilist.done", {
                  imported: result?.imported ?? 0,
                  skipped: result?.skipped ?? 0,
                })}
          </span>
        </div>
      )}
      {!importing && failures.length > 0 && (
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
