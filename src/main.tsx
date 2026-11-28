import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/index.css";

import { StrictMode } from "react";

import { ErrorBoundary } from "@/components/shared/errorBoundary.component";
import { QUERY_CONFIG } from "@/config/system/query.config";
import { PLAYER_ROUTE } from "@/config/player/playerRoute.config";
import {
  isResizeObserverLoopError,
  noteGlobalError,
  toFatalInfo,
} from "@hullperse/hp_utils/fatalClassify";
import { consumeSafeMode, markSessionSafe, reportFatal } from "@/lib/core/system/report.utils";
import { readThemeName } from "@/lib/core/fatal/fatalTheme.utils";
import { attempt, attemptSync } from "@hullperse/hp_utils/attempt";
import { markStartup } from "@/lib/core/system/startup.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";

if (consumeSafeMode()) markSessionSafe();

const escalate = (value: unknown): boolean => {
  if (!noteGlobalError(Date.now())) return false;
  reportFatal({
    ...toFatalInfo(value, {
      scope: "global-loop",
      route: window.location.pathname,
      themeName: readThemeName(),
    }),
  });

  return true;
};

const appError = () => tr("common.error");

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    event.preventDefault();
    const reason = event.error ?? event.message;

    if (isResizeObserverLoopError(reason)) return;

    if (escalate(reason)) return;
    console.error("Uncaught error:", event.error);
    addNotification(appError(), "error", event.error?.message || String(event));
  });

  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();

    if (escalate(event.reason)) return;
    console.error("Unhandled rejection:", event.reason);
    addNotification(appError(), "error", event.reason?.message || String(event.reason));
  });
}

markStartup("module_start");

const queryClient = new QueryClient(QUERY_CONFIG);

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__iluhaQueryClient = queryClient;
}

const showStartupFallback = (message: string): void => {
  const safe = message.replaceAll("<", "&lt;");
  document.body.innerHTML = `<div style="background:#0000aa;color:#fff;font-family:monospace;padding:48px"><p>Startup error</p><p>${safe}</p><button onclick="location.reload()">Reload</button></div>`;
};

const [, mountError] = await attempt(
  (async () => {
    const rootElement = document.querySelector("#root");

    if (!rootElement) throw new Error("Root element not found");

    const [{ createRoot }, content] = await Promise.all([
      import("react-dom/client"),
      (async () => {
        if (window.location.pathname === PLAYER_ROUTE) {
          document.documentElement.dataset.playerWindow = "on";
          const { default: PlayerWindow } =
            await import("@/routes/components/player/player.component");

          return (
            <div
              className="text-text relative h-screen w-screen overflow-hidden"
              aria-label="iluhaAnime"
            >
              <PlayerWindow />
            </div>
          );
        }

        const [{ RouterProvider }, { router }] = await Promise.all([
          import("@tanstack/react-router"),
          import("@/routes/__root"),
        ]);

        return <RouterProvider router={router} />;
      })(),
    ]);
    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary onResetCache={() => queryClient.clear()}>
          <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>
    );
    markStartup("react_mount");
    requestAnimationFrame(() => markStartup("first_paint"));
  })()
);

if (mountError !== null) {
  console.error("Startup failed:", mountError);
  const info = {
    ...toFatalInfo(mountError, { scope: "startup", route: "/", themeName: readThemeName() }),
  };
  const [, reportError] = attemptSync(() => reportFatal(info));

  if (reportError !== null) console.error("Startup fatal report failed:", reportError);
  showStartupFallback(info.message);
}
