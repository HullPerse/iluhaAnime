import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useProxyTest } from "@/hooks/proxyTest.hook";

export function ProxyCheck({
  test,
  resetKey,
  runToken = 0,
  invalid = false,
  disabled = false,
  okLabel,
  failLabel,
  className = "",
}: {
  test: () => Promise<string>;
  resetKey: string | null;
  runToken?: number;
  invalid?: boolean;
  disabled?: boolean;
  okLabel?: string;
  failLabel?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const { state, running, slow, elapsedSecs, run, cancel, reset } = useProxyTest();
  const testRef = useRef(test);
  const lastResetKeyRef = useRef<string | null>(resetKey);
  const blocked = invalid || disabled;
  const blockedRef = useRef(blocked);

  useEffect(() => {
    testRef.current = test;
    blockedRef.current = blocked;
  });

  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    reset();
  }, [resetKey, reset]);

  useEffect(() => {
    if (runToken > 0 && !blockedRef.current) {
      run(() => testRef.current()).catch(() => undefined);
    }
  }, [runToken, run]);

  let status: string | null = null;
  let tone = "text-hint";
  if (running) {
    status = t("settings.proxy.test.running", { seconds: elapsedSecs });
    if (slow) tone = "text-destructive";
  } else if (state.kind === "ok") {
    status = `${okLabel ?? t("settings.proxy.test.ok")} - ${state.message}`;
    tone = "text-success";
  } else if (state.kind === "fail") {
    status = `${failLabel ?? t("settings.proxy.test.fail")}: ${state.message}`;
    tone = "text-destructive";
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="h-6 px-2 text-xs"
          aria-busy={running || undefined}
          disabled={!running && blocked}
          title={!running && disabled ? t("tabs.offlineUnavailable") : undefined}
          onClick={() => {
            if (running) {
              cancel();
              return;
            }
            if (blocked) return;
            run(test).catch(() => undefined);
          }}
        >
          {running
            ? t("settings.proxy.test.cancel")
            : state.kind === "idle"
              ? t("settings.proxy.test.action")
              : t("settings.proxy.test.retest")}
        </Button>
        {status !== null && (
          <span
            className={`windows95-text min-w-0 max-w-full text-xs break-words ${tone}`}
            role="status"
            aria-live="polite"
          >
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
