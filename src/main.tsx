import { StrictMode } from "react";
import "@/index.css";

import { router } from "@/routes/__root";
import { RouterProvider } from "@tanstack/react-router";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { QueryConfig } from "@/config/query.config";
import { ErrorBoundary } from "@/components/shared/error.component";
import { useNotificationStore } from "@/store/notification.store";

window.addEventListener("error", (event) => {
  event.preventDefault();
  console.error("Uncaught error:", event.error);
  useNotificationStore.getState().add(
    "Ошибка",
    "error",
    event.error?.message || String(event),
  );
});

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.error("Unhandled rejection:", event.reason);
  useNotificationStore.getState().add(
    "Ошибка",
    "error",
    event.reason?.message || String(event.reason),
  );
});

const queryClient = new QueryClient(QueryConfig);

await import("react-dom/client").then(async ({ createRoot }) => {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Root element not found");

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
});
