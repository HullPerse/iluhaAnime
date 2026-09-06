export interface UpscaleConfig {
  width: number;
  height: number;
  targetFps: number | null;
  interpolate: boolean;
  quality: string;
  gpuBackend: string;
  videoCodec: string;
  aiUpscaler: string | null;
  selectedShaders?: string[];
  temporalDenoise?: boolean;
}

export interface PreviewFrame {
  timestamp: number;
  before: string;
  after: string;
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
  stage?: string;
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
  addUpscaleItem: (filePath: string, name: string, config: UpscaleConfig) => string;
  addConvertItem: (filePath: string, name: string, config: ConvertConfig) => string;
  removeItem: (id: string) => void;
  clearDone: () => void;
  clearAll: () => void;
  restartItem: (id: string) => void;
  processNext: () => Promise<void>;
}

export interface ShaderInfo {
  id: string;
  filename: string;
  category: string;
  description: string;
  speed_factor: number;
  is_default: boolean;
  exclusive_group: string | null;
}
