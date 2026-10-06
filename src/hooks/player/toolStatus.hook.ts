import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { TranslationKey } from "@/types/i18n";
import type { CommandName } from "@/types/ipc";
import type { UpscaleToolStatus } from "@/types/player";

export type UpscaleTool = "rife" | "realcugan";

const CHECK_COMMAND: Record<UpscaleTool, CommandName> = {
  rife: "check_rife",
  realcugan: "check_realcugan",
};

const DOWNLOAD_COMMAND: Record<UpscaleTool, CommandName> = {
  rife: "download_rife",
  realcugan: "download_realcugan",
};

const DOWNLOAD_ERROR_KEY: Record<UpscaleTool, TranslationKey> = {
  rife: "player.rife.download.error",
  realcugan: "player.realcugan.download.error",
};

export function useUpscaleToolStatus(tool: UpscaleTool) {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpscaleToolStatus>("checking");
  const [percent, setPercent] = useState<number | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    attempt(invokeTyped<boolean>(CHECK_COMMAND[tool])).then(([ok, err]) => {
      if (alive) setStatus(ok && !err ? "ok" : "missing");
    });
    return () => {
      alive = false;
    };
  }, [tool]);

  useEffect(() => {
    if (status !== "downloading") {
      setPercent(null);
    }
  }, [status]);

  useTauriEvent<{ downloaded: number; total: number; stage: string }>(
    `${tool}-download-progress`,
    (e) => {
      if (e.payload.stage === "done") {
        setPercent(null);
      } else if (e.payload.total > 0) {
        setPercent(Math.round((e.payload.downloaded / e.payload.total) * 100));
      }
    },
    { enabled: status === "downloading", errorTag: `${tool}.download` }
  );

  const download = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus("downloading");
    setDlError(null);
    const [, err] = await attempt(invokeTyped<string>(DOWNLOAD_COMMAND[tool]));
    if (err) {
      setDlError(t(DOWNLOAD_ERROR_KEY[tool], { message: err.message }));
      setStatus("missing");
    } else {
      setStatus("ok");
    }
    busyRef.current = false;
  }, [t, tool]);

  return { status, percent, dlError, download };
}
