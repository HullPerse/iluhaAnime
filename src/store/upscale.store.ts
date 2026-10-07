import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { tr } from "@/lib/locale/i18n.utils";
import { buildOutputPath } from "@/lib/player/tree.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type {
  ConvertConfig,
  UpscaleConfig,
  UpscaleQueueItem,
  UpscaleProgressPayload,
} from "@/types/upscale";

let processingLock = false;

let nextId = 1;
function genId() {
  return `job_${nextId++}`;
}

function sameJobConfig(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findDuplicate(
  items: UpscaleQueueItem[],
  jobType: "convert" | "upscale",
  filePath: string,
  config: unknown
): UpscaleQueueItem | undefined {
  return items.find(
    (item) =>
      (item.status === "queued" || item.status === "processing") &&
      item.jobType === jobType &&
      item.filePath === filePath &&
      sameJobConfig(item.config, config)
  );
}

export interface UpscaleSignalStore {
  items: Cell<UpscaleQueueItem[]>;
  processing: Cell<boolean>;
  paused: Cell<boolean>;
  addConvertItem: (filePath: string, name: string, config: ConvertConfig) => string;
  addUpscaleItem: (filePath: string, name: string, config: UpscaleConfig) => string;
  clearAll: () => void;
  clearDone: () => void;
  clearErrors: () => void;
  processNext: () => Promise<void>;
  removeItem: (id: string) => void;
  restartItem: (id: string) => void;
  setPaused: (paused: boolean) => void;
}

export function createUpscaleSignalStore(): UpscaleSignalStore {
  const store = createSignalStore();
  const items = store.atom<UpscaleQueueItem[]>("items", []);
  const processing = store.atom("processing", false);
  const paused = store.atom("paused", false);

  const handle: UpscaleSignalStore = {
    items,
    processing,
    paused,
    addConvertItem: (filePath, name, config) => {
      const duplicate = findDuplicate(items.get(), "convert", filePath, config);
      if (duplicate) return duplicate.id;
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
      items.set([...items.get(), item]);
      if (!processing.get() && !paused.get()) {
        ignore(handle.processNext());
      }
      return id;
    },
    addUpscaleItem: (filePath, name, config) => {
      const duplicate = findDuplicate(items.get(), "upscale", filePath, config);
      if (duplicate) return duplicate.id;
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
      items.set([...items.get(), item]);
      if (!processing.get() && !paused.get()) {
        ignore(handle.processNext());
      }
      return id;
    },
    clearAll: () => {
      if (processing.get()) {
        invokeTyped("cancel_upscale");
      }
      items.set([]);
    },
    clearDone: () => {
      items.set(items.get().filter((i) => i.status !== "done"));
    },
    clearErrors: () => {
      items.set(items.get().filter((i) => i.status !== "error"));
    },
    processNext: async () => {
      const current = items.get();
      if (processingLock || processing.get() || paused.get()) return;
      if (current.some((i) => i.status === "processing")) return;

      processingLock = true;
      const next = current.find((i) => i.status === "queued");
      if (!next) {
        processingLock = false;
        return;
      }

      processing.set(true);
      items.set(
        current.map((i) =>
          i.id === next.id
            ? {
                ...i,
                status: "processing" as const,
                current: undefined,
                total: undefined,
                speed: undefined,
                stage: undefined,
              }
            : i
        )
      );

      let unlisten: UnlistenFn | undefined;
      const [, error] = await attempt(
        (async () => {
          unlisten = await listen<UpscaleProgressPayload>("upscale-progress", (e) => {
            const p = e.payload;
            items.set(
              items.get().map((i) =>
                i.id === next.id
                  ? {
                      ...i,
                      progress: p.total > 0 ? Math.round((p.current / p.total) * 100) : 0,
                      current: p.current,
                      total: p.total,
                      speed: p.speed,
                      stage: p.stage,
                      status: p.stage === "done" ? ("done" as const) : ("processing" as const),
                    }
                  : i
              )
            );
          });

          if (next.jobType === "upscale") {
            const cfg = next.config as UpscaleConfig;
            await invokeTyped("upscale_video", {
              inputPath: next.filePath,
              outputPath: next.outputPath,
              width: cfg.width,
              height: cfg.height,
              targetFps: cfg.targetFps,
              interpolate: cfg.interpolate,
              quality: cfg.quality,
              gpuBackend: cfg.gpuBackend,
              videoCodec: cfg.videoCodec,
              aiUpscaler: cfg.aiUpscaler,
              selectedShaders: cfg.selectedShaders,
              temporalDenoise: cfg.temporalDenoise,
            });
          } else {
            const cfg = next.config as ConvertConfig;
            await invokeTyped("convert_video", {
              inputPath: next.filePath,
              outputPath: next.outputPath,
              targetFormat: cfg.targetFormat,
              copyStreams: cfg.copyStreams,
            });
          }

          items.set(
            items.get().map((i) =>
              i.id === next.id ? { ...i, status: "done", progress: 100 } : i
            )
          );
          if (settingsAtoms.notifyUpscaleDone.get()) {
            const doneKey =
              next.jobType === "upscale"
                ? "notification.upscale.done"
                : "notification.convert.done";
            addNotification(tr(doneKey), "success", next.name);
          }
        })()
      );
      if (error) {
        const msg =
          typeof error.message === "string" && error.message ? error.message : tr("common.error");
        items.set(
          items.get().map((i) =>
            i.id === next.id ? { ...i, status: "error", error: msg } : i
          )
        );
        if (settingsAtoms.notifyUpscaleDone.get()) {
          const failedKey =
            next.jobType === "upscale"
              ? "notification.upscale.failed"
              : "notification.convert.failed";
          addNotification(tr(failedKey), "error", `${next.name}: ${msg}`);
        }
      }
      unlisten?.();
      processing.set(false);
      processingLock = false;
      ignore(handle.processNext());
    },
    removeItem: (id) => {
      const item = items.get().find((i) => i.id === id);
      items.set(items.get().filter((i) => i.id !== id));
      if (item?.status === "processing") {
        invokeTyped("cancel_upscale").catch((error) =>
          reportBackgroundError("upscale.cancel", error)
        );
        processing.set(false);
      }
    },
    restartItem: (id) => {
      items.set(
        items.get().map((i) =>
          i.id === id
            ? {
                ...i,
                status: "queued" as const,
                progress: 0,
                error: undefined,
              }
            : i
        )
      );
      if (!processing.get() && !paused.get()) ignore(handle.processNext());
    },
    setPaused: (value) => {
      paused.set(value);
      if (!value && !processing.get()) ignore(handle.processNext());
    },
  };

  return handle;
}

const upscale = createUpscaleSignalStore();

export const upscaleItems = upscale.items;
export const upscaleProcessing = upscale.processing;
export const upscalePaused = upscale.paused;
export const addConvertItem = upscale.addConvertItem;
export const addUpscaleItem = upscale.addUpscaleItem;
export const clearUpscaleAll = upscale.clearAll;
export const clearUpscaleDone = upscale.clearDone;
export const clearUpscaleErrors = upscale.clearErrors;
export const processUpscaleNext = upscale.processNext;
export const removeUpscaleItem = upscale.removeItem;
export const restartUpscaleItem = upscale.restartItem;
export const setUpscalePaused = upscale.setPaused;
