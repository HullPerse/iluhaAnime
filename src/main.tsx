import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/index.css";

import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";

import { ErrorBoundary } from "@/components/shared/errorBoundary.component";
import { QUERY_CONFIG } from "@/config/store/query.config";
import { noteGlobalError, toFatalInfo } from "@/lib/fatal/classify.utils";
import { consumeSafeMode, markSessionSafe, reportFatal } from "@/lib/fatal/report.utils";
import { readThemeName } from "@/lib/fatal/theme.utils";
import { tr } from "@/lib/locale/i18n.utils";
import { router } from "@/routes/__root";
import { addNotification } from "@/store/notification.store";

if (consumeSafeMode()) markSessionSafe();

function escalate(value: unknown): boolean {
  if (!noteGlobalError(Date.now())) return false;
  reportFatal({
    ...toFatalInfo(value, {
      scope: "global-loop",
      route: window.location.pathname,
      themeName: readThemeName(),
    }),
  });
  return true;
}

const appError = () => tr("common.error");

window.addEventListener("error", (event) => {
  event.preventDefault();
  if (escalate(event.error ?? event.message)) return;
  console.error("Uncaught error:", event.error);
  addNotification(appError(), "error", event.error?.message || String(event));
});

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  if (escalate(event.reason)) return;
  console.error("Unhandled rejection:", event.reason);
  addNotification(appError(), "error", event.reason?.message || String(event.reason));
});

const queryClient = new QueryClient(QUERY_CONFIG);

function showStartupFallback(message: string): void {
  const safe = message.replaceAll("<", "&lt;");
  document.body.innerHTML = `<div style="background:#0000aa;color:#fff;font-family:monospace;padding:48px"><p>Startup error</p><p>${safe}</p><button onclick="location.reload()">Reload</button></div>`;
}

try {
  const rootElement = document.querySelector("#root");
  if (!rootElement) throw new Error("Root element not found");

  const { createRoot } = await import("react-dom/client");
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary onResetCache={() => queryClient.clear()}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>
  );
} catch (error) {
  console.error("Startup failed:", error);
  const info = {
    ...toFatalInfo(error, { scope: "startup", route: "/", themeName: readThemeName() }),
  };
  try {
    reportFatal(info);
  } catch {
  }
  showStartupFallback(info.message);
}
