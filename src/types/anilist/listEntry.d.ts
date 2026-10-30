export interface ListEntryDraft {
  progress: number | null;
  score: number | null;
  list_status: string;
  notes: string | null;
  repeat?: number | null;
  private?: boolean | null;
  hidden_from_status_lists?: boolean | null;
  started_at?: string | null;
  completed_at?: string | null;
  custom_lists: string[];
}
