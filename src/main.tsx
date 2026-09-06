import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@/index.css";

import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";

import { ErrorBoundary } from "@/components/shared/errorBoundary.component";
import { QUERY_CONFIG } from "@/config/store/query.config";
import { translate } from "@/lib/locale/i18n.utils";
import { router } from "@/routes/__root";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

const appError = () => translate(useSettingsStore.getState().language, "common.error");

window.addEventListener("error", (event) => {
  event.preventDefault();
  console.error("Uncaught error:", event.error);
  useNotificationStore.getState().add(appError(), "error", event.error?.message || String(event));
});

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.error("Unhandled rejection:", event.reason);
  useNotificationStore
    .getState()
    .add(appError(), "error", event.reason?.message || String(event.reason));
});

const queryClient = new QueryClient(QUERY_CONFIG);

await import("react-dom/client").then(async ({ createRoot }) => {
  const rootElement = document.querySelector("#root");
  if (!rootElement) throw new Error("Root element not found");

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>
  );
});
