if (
  typeof window !== "undefined" &&
  (window as { localStorage?: unknown }).localStorage === undefined
) {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
}

// Mirrors the runtime-injected Tauri internals so convertFileSrc works in jsdom.
if (
  typeof window !== "undefined" &&
  (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ === undefined
) {
  (window as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {
    convertFileSrc: (filePath: string, protocol = "asset") =>
      `http://${protocol}.localhost/${encodeURIComponent(filePath)}`,
  };
}
