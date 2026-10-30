export interface ScheduledTask {
  cancel: () => void;
}

export interface SleepTask {
  readonly done: Promise<void>;
  cancel: () => void;
}
