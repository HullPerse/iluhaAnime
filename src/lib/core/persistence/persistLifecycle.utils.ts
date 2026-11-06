import type { Persistor } from "@/types/core/persist";

const persistors = new Set<Persistor>();
let installed = false;

function flushAll(): void {
  for (const persistor of persistors) persistor.flush();
}

function installListeners(): void {
  if (installed) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;
  window.addEventListener("beforeunload", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

export function registerPersistor(persistor: Persistor): void {
  persistors.add(persistor);
  installListeners();
}
