import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";

export function FastembedBackfill() {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBackfill = useCallback(async () => {
    setRunning(true);
    setProgress(null);
    setDone(null);
    setError(null);
    try {
      const count = await invokeTyped<number>("backfill_missing_embeddings");
      setDone(count);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    let unlisten: UnlistenFn;
    listen<{ done: number; total: number }>(
      "embeddings-backfill-progress",
      (e: { payload: { done: number; total: number } }) => {
        setProgress({ done: e.payload.done, total: e.payload.total });
      }
    ).then((fn: UnlistenFn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [running]);

  return (
    <div className="flex min-w-0 flex-1 flex-row items-center gap-1">
      <Button onClick={handleBackfill} disabled={running} className="min-h-5.75">
        {t("player.fastembed.backfill")}
      </Button>
      {running && (
        <span className="windows95-text text-xs">
          {t("player.fastembed.backfill.running", {
            done: progress?.done ?? 0,
            total: progress?.total ?? 0,
          })}
        </span>
      )}
      {!running && done !== null && (
        <span className="windows95-text text-xs">
          {t("player.fastembed.backfill.done", { count: done })}
        </span>
      )}
      {error && (
        <span className="windows95-text text-destructive text-xs">
          {t("player.fastembed.backfill.error", { message: error })}
        </span>
      )}
    </div>
  );
}
