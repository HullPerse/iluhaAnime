import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";

import { translate } from "@/lib/i18n";
import { buildOutputPath } from "@/lib/player.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { ConvertConfig, UpscaleConfig } from "@/types";
import type {
  UpscaleQueueItem,
  UpscaleProgressPayload,
  UpscaleQueueStore,
} from "@/types/upscale";

let processingLock = false;

let nextId = 1;
function genId() {
  return `job_${nextId++}`;
}

export const useUpscaleQueueStore = create<UpscaleQueueStore>()((set, get) => ({
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
  clearAll: () => {
    if (get().processing) {
      invoke("cancel_upscale");
    }
    set({ items: [] });
  },
  clearDone: () => {
    set((s) => ({ items: s.items.filter((i) => i.status !== "done") }));
  },
  items: [],
  paused: false,
  processNext: async () => {
    const { items, processing, paused } = get();
    if (processingLock || processing || paused) return;
    if (items.some((i) => i.status === "processing")) return;

    processingLock = true;
    const next = items.find((i) => i.status === "queued");
    if (!next) {
      processingLock = false;
      return;
    }

    set((s) => ({
      processing: true,
      items: s.items.map((i) =>
        i.id === next.id
          ? {
              ...i,
              status: "processing" as const,
              current: undefined,
              total: undefined,
              speed: undefined,
            }
          : i
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
                    progress:
                      p.total > 0 ? Math.round((p.current / p.total) * 100) : 0,
                    current: p.current,
                    total: p.total,
                    speed: p.speed,
                    status:
                      p.stage === "done"
                        ? ("done" as const)
                        : ("processing" as const),
                  }
                : i
            ),
          }));
        }
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
          i.id === next.id ? { ...i, status: "done", progress: 100 } : i
        ),
      }));
    } catch (e: unknown) {
      const msg =
        typeof e === "string"
          ? e
          : translate(useSettingsStore.getState().language, "common.error");
      set((s) => ({
        items: s.items.map((i) =>
          i.id === next.id ? { ...i, status: "error", error: msg } : i
        ),
      }));
    } finally {
      unlisten?.();
      set({ processing: false });
      processingLock = false;
      get().processNext();
    }
  },
  processing: false,
  removeItem: (id) => {
    const item = get().items.find((i) => i.id === id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    if (item?.status === "processing") {
      invoke("cancel_upscale").catch(() => {});
      set({ processing: false });
    }
  },
  restartItem: (id) => {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "queued" as const,
              progress: 0,
              error: undefined,
            }
          : i
      ),
    }));
    const { processing, paused } = get();
    if (!processing && !paused) {
      get().processNext();
    }
  },
  setPaused: (paused) => {
    set({ paused });
    if (!paused && !get().processing) {
      get().processNext();
    }
  },
}));
