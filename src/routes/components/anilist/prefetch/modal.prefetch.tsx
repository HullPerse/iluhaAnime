import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { formatProgressLog } from "@/lib/anilist/prefetch.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { deleteAppCache, readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { PrefetchProgressPayload, PrefetchSnapshot, PrefetchSummary } from "@/types/anilist";
import type { AniPrefetchProps as Props } from "@/types/anilist";

import { CacheSummary } from "./cache.prefetch";
import { RunningSummary } from "./running.prefetch";

export default function PrefetchRelationsModal({ animeIds, onClose }: Props) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<PrefetchSummary | null>(null);
  const [progress, setProgress] = useState<PrefetchProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [stored, setStored] = useState<PrefetchSnapshot | null>(null);
  const [backgrounded, setBackgrounded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const lastWriteRef = useRef(0);
  const unlistenRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    readAppCache<PrefetchSnapshot>("anilist", "prefetch").then((record) => {
      if (mountedRef.current && record?.payload) setStored(record.payload);
    });
    return () => {
      mountedRef.current = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, []);
  const persistSnapshot = (ids: number[], payload: PrefetchProgressPayload) => {
    const now = Date.now();
    if (now - lastWriteRef.current < 2000) return;
    lastWriteRef.current = now;
    writeAppCache("anilist", "prefetch", {
      ids,
      done: payload.done,
      total: payload.total,
    } satisfies PrefetchSnapshot).catch((error) =>
      reportBackgroundError("prefetch.persist", error)
    );
  };
  const start = async (ids: number[] = animeIds) => {
    if (running) return;
    const seeds = [...new Set(ids)];
    setRunning(true);
    setBackgrounded(false);
    setFinished(null);
    setError(null);
    setProgress(null);
    setLog([]);
    setStored(null);
    const unlistenPromise = listen<PrefetchProgressPayload>(
      "anilist-prefetch-progress",
      (event) => {
        if (!mountedRef.current) return;
        setProgress(event.payload);
        setLog((previous) => [
          ...previous,
          ...formatProgressLog(event.payload.items, t("anilist.prefetch.no.relations")),
        ]);
        persistSnapshot(seeds, event.payload);
        if (event.payload.total > 0 && event.payload.done >= event.payload.total) {
          deleteAppCache("anilist", "prefetch").catch((error) =>
            reportBackgroundError("prefetch.cleanup", error)
          );
          setStored(null);
          setRunning(false);
          unlistenRef.current?.();
          unlistenRef.current = null;
        }
      }
    );
    unlistenPromise.then((unlisten) => {
      if (mountedRef.current) unlistenRef.current = unlisten;
      else unlisten();
    });
    let keepListening = false;
    const [result, prefetchError] = await attempt(anilistApi.prefetchRelations(seeds));
    if (prefetchError) {
      if (mountedRef.current) {
        if (prefetchError.message.includes("already running")) {
          keepListening = true;
          setBackgrounded(true);
        } else {
          setError(prefetchError.message);
        }
      }
    } else if (mountedRef.current) {
      setFinished(result);
      setStored(null);
      deleteAppCache("anilist", "prefetch").catch((error) =>
        reportBackgroundError("prefetch.cleanup", error)
      );
      anilistApi
        .syncFranchiseToIndex()
        .catch((error) => reportBackgroundError("franchise.sync", error));
    }
    if (!keepListening) {
      const [unlisten] = await attempt(unlistenPromise);
      unlisten?.();
    }
    if (mountedRef.current && !keepListening) setRunning(false);
  };

  const cancel = async () => {
    const [, error] = await attempt(anilistApi.cancelPrefetch());
    if (error)
      useNotificationStore
        .getState()
        .add(t("anilist.prefetch.cancel.failed"), "error", error.message);
  };
  return (
    <Modal header={t("anilist.prefetch.title")} onClose={onClose}>
      <div className="flex w-full max-w-full flex-col gap-2">
        <p className="windows95-text text-hint text-xs">{t("anilist.prefetch.background.hint")}</p>
        {backgrounded && running ? (
          <p className="windows95-text text-xs font-bold">{t("anilist.prefetch.background")}</p>
        ) : null}
        <CacheSummary progress={progress} finished={finished} t={t} />
        {!running && !finished && !error && (
          <Button onClick={() => start()} className="w-full">
            {t("anilist.prefetch.start")}
          </Button>
        )}
        {!running && !finished && !error && stored ? (
          <Button onClick={() => start(stored.ids)} className="w-full" variant="outline">
            {t("anilist.prefetch.continue", { done: stored.done, total: stored.total })}
          </Button>
        ) : null}
        {running && progress && <RunningSummary progress={progress} t={t} />}
        {finished && (
          <div className="windows95-text flex flex-col gap-1 text-xs">
            <span>
              {finished.cancelled
                ? t("anilist.prefetch.cancelled")
                : t("anilist.prefetch.completed")}
            </span>
            <span>
              {t("anilist.prefetch.processed")}: {finished.processed} -{" "}
              {t("anilist.prefetch.fetched")}: {finished.fetched} - {t("anilist.prefetch.skipped")}:{" "}
              {finished.skipped}
            </span>
          </div>
        )}
        {error && (
          <span className="windows95-text text-destructive text-xs">
            {t("anilist.prefetch.error")}: {error}
          </span>
        )}
        {(log.length > 0 || running) && (
          <div className="flex flex-col gap-1">
            {running && (
              <Button onClick={cancel} variant="error" className="h-auto px-2 py-0.5 text-xs">
                {t("anilist.prefetch.stop")}
              </Button>
            )}
            <div
              ref={logRef}
              className="windows95-border windows95-text bg-field h-40 overflow-y-auto p-1 text-xs leading-tight wrap-break-word whitespace-pre-wrap"
            >
              {log.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </div>
        )}
        {finished && (
          <Button onClick={onClose} className="w-full">
            {t("anilist.prefetch.close")}
          </Button>
        )}
        {running && (
          <Button onClick={onClose} className="w-full" variant="outline">
            {t("anilist.prefetch.background")}
          </Button>
        )}
      </div>
    </Modal>
  );
}
