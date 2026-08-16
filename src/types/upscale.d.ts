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

export type QueueItemStatus = "queued" | "processing" | "done" | "error";
export type JobType = "upscale" | "convert";

export interface UpscaleQueueItem {
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

export interface UpscaleProgressPayload {
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
  addUpscaleItem: (
    filePath: string,
    name: string,
    config: UpscaleConfig
  ) => string;
  addConvertItem: (
    filePath: string,
    name: string,
    config: ConvertConfig
  ) => string;
  removeItem: (id: string) => void;
  clearDone: () => void;
  clearAll: () => void;
  restartItem: (id: string) => void;
  processNext: () => Promise<void>;
}
