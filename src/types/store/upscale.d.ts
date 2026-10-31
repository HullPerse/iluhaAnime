import type { Cell } from "@/types/core/signal";
import type { ConvertConfig, UpscaleConfig, UpscaleQueueItem } from "@/types/core/upscale";

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
