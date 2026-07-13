import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type QueueItemStatus = "queued" | "processing" | "done" | "error";

export interface UpscaleConfig {
  width: number;
  height: number;
  targetFps: number | null;
  interpolate: boolean;
  quality: string;
  gpuBackend: string;
  aiUpscaler: string | null;
}

export interface UpscaleQueueItem {
  id: string;
  filePath: string;
  outputPath: string;
  name: string;
  config: UpscaleConfig;
  status: QueueItemStatus;
  progress: number;
  error?: string;
}

interface UpscaleProgressPayload {
  current: number;
  total: number;
  stage: string;
  speed: number;
}

export interface UpscaleQueueStore {
  items: UpscaleQueueItem[];
  processing: boolean;
  addItem: (filePath: string, name: string, config: UpscaleConfig) => string;
  removeItem: (id: string) => void;
  clearDone: () => void;
  clearAll: () => void;
  restartItem: (id: string) => void;
  processNext: () => Promise<void>;
}

let nextId = 1;
function genId() {
  return `upscale_${nextId++}`;
}

function buildOutputPath(inputPath: string): string {
  const dot = inputPath.lastIndexOf(".");
  return dot > 0
    ? inputPath.slice(0, dot) + "_upscaled.mkv"
    : inputPath + "_upscaled.mkv";
}

export const useUpscaleQueueStore = create<UpscaleQueueStore>((set, get) => ({
  items: [],
  processing: false,

  addItem: (filePath: string, name: string, config: UpscaleConfig) => {
    const id = genId();
    const item: UpscaleQueueItem = {
      id,
      filePath,
      outputPath: buildOutputPath(filePath),
      name,
      config,
      status: "queued",
      progress: 0,
    };
    set((s) => ({ items: [...s.items, item] }));
    const { processing } = get();
    if (!processing) {
      get().processNext();
    }
    return id;
  },

  removeItem: (id: string) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  clearDone: () => {
    set((s) => ({ items: s.items.filter((i) => i.status !== "done") }));
  },

  clearAll: () => {
    set({ items: [] });
  },

  restartItem: (id: string) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, status: "queued" as const, progress: 0, error: undefined } : i,
      ),
    }));
    const { processing } = get();
    if (!processing) {
      get().processNext();
    }
  },

  processNext: async () => {
    const { items, processing } = get();
    if (processing) return;

    const next = items.find((i) => i.status === "queued");
    if (!next) return;

    set((s) => ({
      processing: true,
      items: s.items.map((i) =>
        i.id === next.id ? { ...i, status: "processing" as const } : i,
      ),
    }));

    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<UpscaleProgressPayload>(
        "upscale-progress",
        (e) => {
          const p = e.payload;
          set((s) => ({
            items: s.items.map((i) =>
              i.id === next.id
                ? {
                    ...i,
                    progress: p.total > 0
                      ? Math.round((p.current / p.total) * 100)
                      : 0,
                    status: p.stage === "done" ? "done" as const : "processing" as const,
                  }
                : i,
            ),
          }));
        },
      );

      const cfg = next.config;
      await invoke("upscale_video", {
        inputPath: next.filePath,
        outputPath: next.outputPath,
        width: cfg.width,
        height: cfg.height,
        targetFps: cfg.targetFps,
        interpolate: cfg.interpolate,
        quality: cfg.quality,
        gpuBackend: cfg.gpuBackend,
        aiUpscaler: cfg.aiUpscaler,
      });

      set((s) => ({
        items: s.items.map((i) =>
          i.id === next.id ? { ...i, status: "done", progress: 100 } : i,
        ),
      }));
    } catch (e: unknown) {
      const msg = typeof e === "string" ? e : "Ошибка";
      set((s) => ({
        items: s.items.map((i) =>
          i.id === next.id ? { ...i, status: "error", error: msg } : i,
        ),
      }));
    } finally {
      unlisten?.();
      set({ processing: false });
      // Process next item
      get().processNext();
    }
  },
}));
