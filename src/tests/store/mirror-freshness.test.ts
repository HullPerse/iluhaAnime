import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { createMediaSignalStore } from "@/store/media.store";
import { createPlayerSignalStore } from "@/store/player.store";
import { createSettingsSignalStore } from "@/store/settings.store";

function memoryStorage(backing = new Map<string, string>()) {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => backing.set(key, value),
    removeItem: (key: string) => backing.delete(key),
    clear: () => backing.clear(),
    key: () => null,
    get length() {
      return backing.size;
    },
  };
}

/**
 * Regression: mirror-backed snapshot() readers run synchronously inside
 * cell.set's flush, so the mirror must be updated BEFORE the underlying
 * cell notifies. Otherwise every subscriber (and every persisted snapshot)
 * observes the previous value: single direct writes vanish and rapid
 * writes apply with a one-step lag. Batched writes (settings patch) were
 * immune by accident; direct writes (player setters, bare atom sets)
 * were not.
 */
describe("mirror freshness inside notifications", () => {
  it("player snapshot sees a direct setter synchronously in subscribers", () => {
    const store = createPlayerSignalStore({ getStorage: () => memoryStorage() });
    const seen: number[] = [];
    store.subscribeAll(() => {
      seen.push(store.snapshot().volume);
    });
    store.setVolume(0.9);
    expect(seen).toEqual([0.9]);
    store.setVolume(0.5);
    expect(seen).toEqual([0.9, 0.5]);
  });

  it("settings snapshot sees a direct atom write synchronously in subscribers", () => {
    const store = createSettingsSignalStore({ getStorage: () => memoryStorage() });
    const seen: string[][] = [];
    store.subscribeAll(() => {
      seen.push(store.snapshot().hiddenPlayerFolders);
    });
    store.atoms.hiddenPlayerFolders.set(["C:\\Anime"]);
    expect(seen).toEqual([["C:\\Anime"]]);
  });

  it("media entries stay synchronously readable for subscribers", () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    const seen: number[] = [];
    store.entries.subscribe(() => {
      seen.push(store.getEntry("/media/ep01.mkv")?.position ?? -1);
    });
    store.setPosition("/media/ep01.mkv", 10, 600);
    store.setPosition("/media/ep01.mkv", 20, 600);
    expect(seen).toEqual([10, 20]);
  });
});
