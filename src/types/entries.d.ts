export interface EntryListInfo {
  progress: number | null;
  score: number | null;
  list_status: string;
  created_at: number | null;
  updated_at: number | null;
  completed_at: string | null;
  started_at: string | null;
  notes: string | null;
  repeat?: number | null;
  private?: boolean | null;
  hidden_from_status_lists?: boolean | null;
  custom_lists: string[];
}

export type EntryLookup = Map<number, EntryListInfo>;
