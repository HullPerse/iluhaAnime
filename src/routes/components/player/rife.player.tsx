import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";

type Status = "checking" | "ok" | "missing" | "downloading";

export function RIFE() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("checking");
  const [percent, setPercent] = useState<number | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    attempt(invokeTyped<boolean>("check_rife")).then(([ok, err]) => {
      if (alive) setStatus(ok && !err ? "ok" : "missing");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "downloading") {
      setPercent(null);
      return;
    }
    let unlisten: UnlistenFn | undefined;
    listen<{ downloaded: number; total: number; stage: string }>("rife-download-progress", (e) => {
      if (e.payload.stage === "done") {
        setPercent(null);
      } else if (e.payload.total > 0) {
        setPercent(Math.round((e.payload.downloaded / e.payload.total) * 100));
      }
    }).then((fn: UnlistenFn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [status]);

  const handleDownload = useCallback(async () => {
    setStatus("downloading");
    setDlError(null);
    const [, err] = await attempt(invokeTyped<string>("download_rife"));
    if (err) {
      setDlError(t("player.rife.download.error", { message: err.message }));
      setStatus("missing");
    } else {
      setStatus("ok");
    }
  }, [t]);

  if (status === "checking") return null;

  return (
    <div className="flex flex-col gap-1">
      {status === "ok" && (
        <span className="windows95-text text-xs">{t("player.rife.installed")}</span>
      )}
      {status === "missing" && (
        <>
          <span className="windows95-text text-xs">{t("player.rife.missing")}</span>
          <Button onClick={handleDownload}>
            <Download className="size-3" />
            {t("player.rife.download")}
          </Button>
        </>
      )}
      {status === "downloading" && (
        <Button onClick={handleDownload} disabled>
          <Download className="size-3" />
          {percent !== null ? t("player.rife.downloading", { percent }) : t("player.rife.download")}
        </Button>
      )}
      {dlError && <span className="text-destructive text-xs">{dlError}</span>}
    </div>
  );
}
