import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

const mockInvoke = vi.fn();
const listeners = new Map<string, (event: { payload: unknown }) => void>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(event, handler);
    return Promise.resolve(() => {
      listeners.delete(event);
    });
  },
}));

import { createUpscaleSignalStore, type UpscaleSignalStore } from "@/store/upscale.store";
import type { UpscaleConfig } from "@/types/upscale";

const CONFIG: UpscaleConfig = {
  width: 1920,
  height: 1080,
  targetFps: null,
  interpolate: false,
  quality: "balanced",
  gpuBackend: "auto",
  videoCodec: "h264",
  aiUpscaler: null,
  selectedShaders: [],
  temporalDenoise: false,
};

function setup(): UpscaleSignalStore {
  const store = createUpscaleSignalStore();
  store.setPaused(true);
  return store;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined);
  listeners.clear();
});

describe("upscale queue", () => {
  it("adds items while paused without starting work", () => {
    const store = setup();
    const id = store.addUpscaleItem("/a.mkv", "a", CONFIG);
    expect(typeof id).toBe("string");
    expect(store.items.get()).toHaveLength(1);
    expect(store.items.get()[0]?.status).toBe("queued");
  });

  it("returns the duplicate id for the same job", () => {
    const store = setup();
    const first = store.addUpscaleItem("/a.mkv", "a", CONFIG);
    const second = store.addUpscaleItem("/a.mkv", "a", CONFIG);
    expect(second).toBe(first);
    expect(store.items.get()).toHaveLength(1);
  });

  it("removes items and clears finished or failed ones", () => {
    const store = setup();
    const id = store.addUpscaleItem("/a.mkv", "a", CONFIG);
    store.removeItem(id);
    expect(store.items.get()).toHaveLength(0);
    store.addUpscaleItem("/b.mkv", "b", CONFIG);
    store.clearDone();
    expect(store.items.get()).toHaveLength(1);
    store.clearAll();
    expect(store.items.get()).toHaveLength(0);
  });

  it("restarts items back to queued", () => {
    const store = setup();
    const id = store.addUpscaleItem("/a.mkv", "a", CONFIG);
    store.restartItem(id);
    expect(store.items.get()[0]).toMatchObject({ status: "queued", progress: 0 });
  });

  it("processes queued items to done on unpause", async () => {
    const store = createUpscaleSignalStore();
    store.addUpscaleItem("/a.mkv", "a", CONFIG);
    await waitFor(() => expect(store.items.get()[0]?.status).toBe("done"));
    expect(store.items.get()[0]?.progress).toBe(100);
  });

  it("marks items as error when the backend fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("nope"));
    const store = createUpscaleSignalStore();
    store.addUpscaleItem("/a.mkv", "a", CONFIG);
    await waitFor(() => expect(store.items.get()[0]?.status).toBe("error"));
    store.clearErrors();
    expect(store.items.get()).toHaveLength(0);
  });
});
