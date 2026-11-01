export interface EntryPatch {
  progress?: number;
  list_status?: string;
  custom_lists?: string[];
}

export interface LiveEntryFields {
  status: string;
  score: number | null;
  notes: string | null;
}

export interface StepperFailure {
  target: number;
  reason: string;
}

export type StepperPhase = "idle" | "syncing" | "saved" | "error";
