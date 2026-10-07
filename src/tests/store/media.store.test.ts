import { describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { createMediaSignalStore } from "@/store/media.store";

function memoryStorage(backing = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  };
}

describe("media entries", () => {
  it("starts empty without storage", () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    expect(store.getEntry("/a.mkv")).toBeUndefined();
  });

  it("touches entries to the front on position updates", () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    store.setPosition("/a.mkv", 10, 100);
    store.setPosition("/b.mkv", 5, 50);
    store.setPosition("/a.mkv", 20, 100);
    expect(store.entries.get().map((entry) => entry.path)).toEqual(["/a.mkv", "/b.mkv"]);
    expect(store.getEntry("/a.mkv")?.position).toBe(20);
  });

  it("patches tracks and offsets per path", () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    store.setTrack("/a.mkv", "audio", 2);
    store.setSubOffset("/a.mkv", 0.5);
    store.setAudioOffset("/a.mkv", -0.25);
    expect(store.getEntry("/a.mkv")).toMatchObject({
      audioTrack: 2,
      subOffset: 0.5,
      audioOffset: -0.25,
    });
  });

  it("clears all entries", () => {
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    store.setPosition("/a.mkv", 1, 10);
    store.clearEntries();
    expect(store.entries.get()).toEqual([]);
  });

  it("hydrates from the backend and keeps local track choices", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ position: 30, duration: 90, subDelay: 1, audioDelay: 2 });
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    store.setTrack("/a.mkv", "sub", 3);
    const merged = await store.hydrate("/a.mkv");
    expect(merged).toMatchObject({ position: 30, duration: 90, subOffset: 1, subtitleTrack: 3 });
  });

  it("returns the local entry when the backend has nothing", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(null);
    const store = createMediaSignalStore({ getStorage: () => memoryStorage() });
    store.setPosition("/a.mkv", 7, 70);
    await expect(store.hydrate("/a.mkv")).resolves.toMatchObject({ position: 7 });
  });

  it("adopts the legacy mediaState envelope once", () => {
    const backing = new Map<string, string>([
      [
        "mediaState",
        JSON.stringify({ state: { entries: [{ path: "/a.mkv", position: 5 }] } }),
      ],
    ]);
    const store = createMediaSignalStore({ getStorage: () => memoryStorage(backing) });
    expect(store.getEntry("/a.mkv")?.position).toBe(5);
    expect(backing.has("iluha.v1.media")).toBe(true);
    expect(backing.has("mediaState")).toBe(false);
  });
});
