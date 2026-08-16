import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { cn } from "@/lib/index.utils";
import { useI18n } from "@/lib/i18n";

interface PrefetchItem {
  id: number;
  title: string;
  relations: string[];
}

interface PrefetchProgressPayload {
  done: number;
  total: number;
  remaining: number;
  fetched: number;
  skipped: number;
  current: string | null;
  items: PrefetchItem[];
  elapsed_ms: number;
  eta_secs: number | null;
  next_batch_in_ms: number;
}

interface PrefetchSummary {
  processed: number;
  fetched: number;
  skipped: number;
  cancelled: boolean;
}

interface Props {
  animeIds: number[];
  onClose: () => void;
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function PrefetchRelationsModal({ animeIds, onClose }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<PrefetchSummary | null>(null);
  const [progress, setProgress] = useState<PrefetchProgressPayload | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  const start = async () => {
    if (running) return;
    setRunning(true);
    setFinished(null);
    setError(null);
    setProgress(null);
    setLog([]);

    const unlistenPromise = listen<PrefetchProgressPayload>(
      "anilist-prefetch-progress",
      (e) => {
        const p = e.payload;
        setProgress(p);
        setLog((prev) => {
          const lines: string[] = [];
          for (const item of p.items) {
            if (item.relations.length === 0) {
              lines.push(
                `${item.title} → ${t("anilist.prefetch.noRelations")}`
              );
            } else {
              for (const r of item.relations) {
                lines.push(`${item.title} → ${r}`);
              }
            }
          }
          return [...prev, ...lines];
        });
      }
    );

    try {
      const result = await invoke<PrefetchSummary>("prefetch_anime_relations", {
        animeIds: [...new Set(animeIds)],
      });
      setFinished(result);
      invoke("sync_franchise_to_index").catch(() => {});
    } catch (error) {
      setError(typeof error === "string" ? error : String(error));
    } finally {
      const unlisten = await unlistenPromise;
      unlisten();
      setRunning(false);
    }
  };

  const cancel = async () => {
    try {
      await invoke("cancel_anime_prefetch");
    } catch {}
  };

  const fetchedCount = progress?.fetched ?? finished?.fetched ?? 0;
  const skippedCount = progress?.skipped ?? finished?.skipped ?? 0;
  const cacheTotal = fetchedCount + skippedCount;
  const cachedPercent =
    cacheTotal > 0 ? Math.round((skippedCount / cacheTotal) * 100) : 0;
  const fetchedPercent = cacheTotal > 0 ? 100 - cachedPercent : 0;

  return (
    <Modal header={t("anilist.prefetch.title")} onClose={onClose}>
      <div className="flex w-full max-w-full flex-col gap-2">
        <p className="windows95-text text-muted text-[10px]">
          {t("anilist.prefetch.description")}
        </p>

        {(progress || finished) && (
          <section className="windows95-active-border flex flex-col gap-1 bg-white p-1">
            <div className="windows95-text flex items-center justify-between text-[10px] font-bold">
              <span>{t("anilist.prefetch.cacheVisualTitle")}</span>
              <span className="text-muted">{cachedPercent}%</span>
            </div>
            <div className="windows95-border flex h-3 gap-px overflow-hidden bg-surface p-px">
              <div
                className="bg-secondary transition-[width] duration-300"
                style={{ width: `${fetchedPercent}%` }}
                title={t("anilist.prefetch.cacheFetched")}
              />
              <div
                className="bg-green-500 transition-[width] duration-300"
                style={{ width: `${cachedPercent}%` }}
                title={t("anilist.prefetch.cacheHit")}
              />
            </div>
            <div className="windows95-text grid grid-cols-3 gap-1 text-[9px]">
              <div className="bg-primary px-1 py-0.5">
                <div className="text-muted">{t("anilist.prefetch.cacheProcessed")}</div>
                <strong>{progress?.done ?? finished?.processed ?? 0}</strong>
              </div>
              <div className="bg-secondary/15 px-1 py-0.5">
                <div className="text-muted">{t("anilist.prefetch.cacheFetched")}</div>
                <strong>{fetchedCount}</strong>
              </div>
              <div className="bg-green-100 px-1 py-0.5">
                <div className="text-muted">{t("anilist.prefetch.cacheHit")}</div>
                <strong>{skippedCount}</strong>
              </div>
            </div>
            {progress?.current && (
              <div className="windows95-text flex items-center gap-1 text-[9px]">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-secondary" />
                <span className="text-muted">{t("anilist.prefetch.cacheCurrent")}</span>
                <span className="min-w-0 truncate font-bold">{progress.current}</span>
              </div>
            )}
            {progress?.items && progress.items.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {progress.items.slice(-12).map((item) => (
                  <span
                    key={item.id}
                    className={cn(
                      "windows95-border max-w-35 truncate px-1 py-px text-[9px]",
                      item.relations.length > 0
                        ? "bg-secondary/10 text-text"
                        : "bg-surface text-muted"
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {!running && !finished && !error && (
          <Button onClick={start} className="w-full">
            {t("anilist.prefetch.start")}
          </Button>
        )}

        {running && progress && (
          <div className="flex flex-col gap-1">
            <ProgressBar value={progress.done} max={progress.total} />
            <div className="windows95-text flex flex-row items-center justify-between text-[10px]">
              <span>
                {t("anilist.prefetch.done")}: {progress.done} / {progress.total}
              </span>
              <span>
                {t("anilist.prefetch.remaining")}: {progress.remaining}
              </span>
            </div>
            <div className="windows95-text text-muted text-[10px]">
              {t("anilist.prefetch.fetched")}: {progress.fetched} ·{" "}
              {t("anilist.prefetch.skipped")}: {progress.skipped}
              {progress.current && (
                <>
                  {" "}
                  · {t("anilist.prefetch.current")}:{" "}
                  <strong>{progress.current}</strong>
                </>
              )}
            </div>
            <div className="windows95-text text-muted flex flex-row items-center justify-between text-[10px]">
              <span>
                {t("anilist.prefetch.time")}:{" "}
                {formatDuration(progress.elapsed_ms / 1000)}
              </span>
              <span>
                {t("anilist.prefetch.eta")}: ~{" "}
                {progress.eta_secs == null
                  ? "…"
                  : formatDuration(progress.eta_secs)}
              </span>
              <span>
                {t("anilist.prefetch.nextBatch")}:{" "}
                {(progress.next_batch_in_ms / 1000).toFixed(1)}с
              </span>
            </div>
          </div>
        )}

        {finished && (
          <div className="windows95-text flex flex-col gap-1 text-[10px]">
            <span>
              {finished.cancelled
                ? t("anilist.prefetch.cancelled")
                : t("anilist.prefetch.completed")}
            </span>
            <span>
              {t("anilist.prefetch.processed")}: {finished.processed} ·{" "}
              {t("anilist.prefetch.fetched")}: {finished.fetched} ·{" "}
              {t("anilist.prefetch.skipped")}: {finished.skipped}
            </span>
          </div>
        )}

        {error && (
          <span className="windows95-text text-destructive text-[10px]">
            {t("anilist.prefetch.error")}: {error}
          </span>
        )}

        {(log.length > 0 || running) && (
          <div className="flex flex-col gap-1">
            {running && (
              <div className="flex flex-row gap-1">
                <Button
                  onClick={cancel}
                  variant="error"
                  className="h-auto px-2 py-0.5 text-[10px]"
                >
                  {t("anilist.prefetch.stop")}
                </Button>
              </div>
            )}
            <div
              ref={logRef}
              className="windows95-border windows95-text h-40 overflow-y-auto bg-white p-1 text-[10px] leading-tight wrap-break-word whitespace-pre-wrap"
            >
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {finished && (
          <Button onClick={onClose} className="w-full">
            {t("anilist.prefetch.close")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
