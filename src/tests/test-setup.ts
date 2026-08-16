// Vitest setup: runs before every test file's imports.
// The vitest jsdom environment does not expose window.localStorage here, but
// zustand persist (settings/cache/theme stores) reads it at module-import time
// via createJSONStorage(() => window.localStorage). Provide a working stub in
// jsdom only; node-environment tests stub their own globals.
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
