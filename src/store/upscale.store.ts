import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { buildOutputPath } from "@/lib/player.utils";

type QueueItemStatus = "queued" | "processing" | "done" | "error";
type JobType = "upscale" | "convert";

export interface UpscaleConfig {
  width: number;
  height: number;
  targetFps: number | null;
  interpolate: boolean;
  quality: string;
  gpuBackend: string;
  aiUpscaler: string | null;
  selectedShaders?: string[];
}

export interface ConvertConfig {
  targetFormat: string;
  copyStreams: boolean;
}

interface UpscaleQueueItem {
  id: string;
  jobType: JobType;
  filePath: string;
  outputPath: string;
  name: string;
  config: UpscaleConfig | ConvertConfig;
  status: QueueItemStatus;
  progress: number;
  current?: number;
  total?: number;
  speed?: number;
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
  paused: boolean;
  setPaused: (paused: boolean) => void;
  addUpscaleItem: (filePath: string, name: string, config: UpscaleConfig) => string;
  addConvertItem: (filePath: string, name: string, config: ConvertConfig) => string;
  removeItem: (id: string) => void;
  clearDone: () => void;
  clearAll: () => void;
  restartItem: (id: string) => void;
  processNext: () => Promise<void>;
}

let nextId = 1;
function genId() {
  return `job_${nextId++}`;
}

export const useUpscaleQueueStore = create<UpscaleQueueStore>()(
  persist(
    (set, get) => ({
      items: [],
      processing: false,
      paused: false,

      setPaused: (paused) => {
        set({ paused });
      },

      addUpscaleItem: (filePath, name, config) => {
        const id = genId();
        const item: UpscaleQueueItem = {
          id,
          jobType: "upscale",
          filePath,
          outputPath: buildOutputPath(filePath, "_upscaled"),
          name,
          config,
          status: "queued",
          progress: 0,
        };
        set((s) => ({ items: [...s.items, item] }));
        const { processing, paused } = get();
        if (!processing && !paused) {
          get().processNext();
        }
        return id;
      },

      addConvertItem: (filePath, name, config) => {
        const id = genId();
        const item: UpscaleQueueItem = {
          id,
          jobType: "convert",
          filePath,
          outputPath: buildOutputPath(filePath, "_converted"),
          name,
          config,
          status: "queued",
          progress: 0,
        };
        set((s) => ({ items: [...s.items, item] }));
        const { processing, paused } = get();
        if (!processing && !paused) {
          get().processNext();
        }
        return id;
      },

      removeItem: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      },

      clearDone: () => {
        set((s) => ({ items: s.items.filter((i) => i.status !== "done") }));
      },

      clearAll: () => {
        set({ items: [] });
      },

      restartItem: (id) => {
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, status: "queued" as const, progress: 0, error: undefined } : i,
          ),
        }));
        const { processing, paused } = get();
        if (!processing && !paused) {
          get().processNext();
        }
      },

      processNext: async () => {
        const { items, processing, paused } = get();
        if (processing || paused) return;

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
                        current: p.current,
                        total: p.total,
                        speed: p.speed,
                        status: p.stage === "done" ? ("done" as const) : ("processing" as const),
                      }
                    : i,
                ),
              }));
            },
          );

          if (next.jobType === "upscale") {
            const cfg = next.config as UpscaleConfig;
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
              selectedShaders: cfg.selectedShaders,
            });
          } else {
            const cfg = next.config as ConvertConfig;
            await invoke("convert_video", {
              inputPath: next.filePath,
              outputPath: next.outputPath,
              targetFormat: cfg.targetFormat,
              copyStreams: cfg.copyStreams,
            });
          }

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
          get().processNext();
        }
      },
    }),
    {
      name: "upscale-queue",
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => {
        const items = (persisted as { items?: UpscaleQueueItem[] })?.items ?? [];
        return {
          ...current,
          items: items.map((i) =>
            i.status === "processing" ? { ...i, status: "queued" as const } : i,
          ),
        };
      },
    },
  ),
);
