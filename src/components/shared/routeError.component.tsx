import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { FatalScreen } from "@/components/shared/fatal/screen.fatal";
import { toFatalInfo } from "@/lib/fatalClassify.utils";
import { clearFatal, isCurrentSessionSafe, reportFatal, requestSafeMode } from "@/lib/report.utils";
import { readThemeName } from "@/lib/fatalTheme.utils";
import { attemptSync } from "@/lib/attempt.utils";

export function RouteErrorScreen({ error, reset }: ErrorComponentProps) {
  const fatal = useMemo(
    () => ({
      ...toFatalInfo(error, {
        scope: "router",
        route: window.location.pathname,
        themeName: readThemeName(),
      }),
      retryCount: 0,
    }),
    [error]
  );

  useEffect(() => {
    reportFatal(fatal);
  }, [fatal]);

  const reload = (safe: boolean) => {
    if (safe) requestSafeMode();
    clearFatal();
    window.location.reload();
  };

  const handleRetry = () => {
    const [, resetError] = attemptSync(() => reset());
    if (resetError !== null) window.location.reload();
  };

  return (
    <FatalScreen
      info={fatal}
      safe={isCurrentSessionSafe()}
      onReload={() => reload(false)}
      onSafeReload={() => reload(true)}
      onRetry={handleRetry}
    />
  );
}
