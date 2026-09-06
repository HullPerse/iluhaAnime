export type JobStatus = "running" | "done" | "error" | "cancelled";

export interface JobItem {
  id: string;
  title: string;
  stage: string;
  done: number;
  total: number;
  status: JobStatus;
  failures: string[];
  onCancel?: () => void;
}

export interface JobsStore {
  jobs: Record<string, JobItem>;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  upsertJob: (job: JobItem) => void;
  updateProgress: (id: string, done: number, total: number, stage?: string) => void;
  finishJob: (id: string) => void;
  failJob: (id: string, error: string) => void;
  cancelJob: (id: string) => void;
  removeJob: (id: string) => void;
  clearFinished: () => void;
}
