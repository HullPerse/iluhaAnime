import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { queueDepthSteps } from "@/lib/player/queue.utils";
import { useJobsStore } from "@/store/jobs.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { JobItem } from "@/types/jobs";

interface JobRow extends JobItem {
  onCancel?: () => void;
  onRetry?: () => void;
}

function JobCenterRow({ job }: { job: JobRow }) {
  const running = job.status === "running";
  const pct = job.total > 0 ? Math.min((job.done / job.total) * 100, 100) : 0;
  const handleCancel = () => job.onCancel?.();
  return (
    <div>
      <div className="flex flex-row items-baseline gap-2 px-1 py-1">
        <span className="windows95-text min-w-0 flex-1 truncate text-xs" title={job.title}>
          {job.title}
        </span>
        <span className="windows95-text text-hint shrink-0 text-xs">{job.stage}</span>
        <span className="windows95-text text-hint w-20 shrink-0 text-right text-xs">
          {job.total > 0 ? `${job.done}/${job.total}` : `${Math.round(pct)}%`}
        </span>
        {running && job.onCancel ? (
          <Button
            className="h-5 shrink-0 px-1 text-xs"
            variant="destructive"
            onClick={handleCancel}
            aria-label="cancel"
          >
            ✕
          </Button>
        ) : null}
      </div>
      <div className="px-1 pb-1">
        <div className="h-0.5 bg-black/10">
          <div
            className={job.status === "error" ? "h-full bg-red-700" : "bg-secondary h-full"}
            style={{ width: `${running || job.status === "done" ? pct : 100}%` }}
          />
        </div>
      </div>
      {job.failures.length > 0 ? (
        <ul className="windows95-border mx-1 mb-1 flex max-h-16 flex-col gap-0.5 overflow-auto bg-white p-1">
          {job.failures.map((failure) => (
            <li
              key={failure}
              className="windows95-text text-destructive truncate text-xs"
              title={failure}
            >
              {failure}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function JobCenterPanel() {
  const { t } = useI18n();
  const open = useJobsStore((s) => s.panelOpen);
  const setPanelOpen = useJobsStore((s) => s.setPanelOpen);
  const manual = useJobsStore((s) => s.jobs);
  const cancelJob = useJobsStore((s) => s.cancelJob);
  const upscaleItems = useUpscaleQueueStore((s) => s.items);
  const removeUpscaleItem = useUpscaleQueueStore((s) => s.removeItem);
  const [collapsed, setCollapsed] = useState(false);
  if (!open) return null;
  const upscaleRows: JobRow[] = upscaleItems.map((item) => {
    const steps = queueDepthSteps(item, t);
    const active = steps.find((s) => s.active);
    return {
      id: `upscale:${item.id}`,
      title: item.name,
      stage: active ? `${active.label} ${active.detail}`.trim() : item.status,
      done: item.total != null && item.total > 0 ? (item.current ?? 0) : item.progress,
      total: item.total != null && item.total > 0 ? item.total : 100,
      status: item.status === "done" ? "done" : item.status === "error" ? "error" : "running",
      failures: item.status === "error" && item.error ? [item.error] : [],
      onCancel: () => removeUpscaleItem(item.id),
    };
  });
  const rows: JobRow[] = [
    ...Object.values(manual).map((job) => ({
      ...job,
      onCancel: () => cancelJob(job.id),
    })),
    ...upscaleRows,
  ];
  const running = rows.filter((r) => r.status === "running");
  const totals = rows.reduce(
    (acc, r) => ({ done: acc.done + r.done, total: acc.total + r.total }),
    { done: 0, total: 0 }
  );
  const overall = totals.total > 0 ? Math.min((totals.done / totals.total) * 100, 100) : 100;
  return (
    <div className="ui-panel flex w-full flex-col p-1">
      <div className="windows95-text flex w-full items-center gap-1 px-0.5 py-0.5">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={t("jobs.title")}
          className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <ChevronRight className="size-3 shrink-0" />
          ) : (
            <ChevronDown className="size-3 shrink-0" />
          )}
          <ImageComponent
            src="/images/w98_directory_admin_tools.ico"
            alt=""
            className="size-4 shrink-0"
          />
          <span className="truncate text-xs font-bold select-none">
            {t("jobs.title")}
            {running.length > 0 ? ` (${running.length})` : ""}
          </span>
        </button>
        {!collapsed ? (
          <Button
            className="h-5 shrink-0 px-1 text-xs"
            onClick={() => setPanelOpen(false)}
            aria-label={t("common.close")}
          >
            ✕
          </Button>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <span className="block h-1 w-24 bg-black/10">
              <span className="bg-secondary block h-full" style={{ width: `${overall}%` }} />
            </span>
            <span className="text-hint text-xs whitespace-nowrap select-none">
              {Math.round(overall)}%
            </span>
          </span>
        )}
      </div>
      {!collapsed ? (
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {rows.length === 0 ? (
            <span className="windows95-text text-hint px-1 py-1 text-xs">{t("jobs.empty")}</span>
          ) : (
            rows.map((job) => <JobCenterRow key={job.id} job={job} />)
          )}
        </div>
      ) : null}
    </div>
  );
}
