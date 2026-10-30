export interface AiringRow {
  id: number;
  title: string;
  cover: string | null;
  episode: number | null;
  airingAt: number;
  listStatus: string;
}

export interface AiringDay {
  dayStartMs: number;
  rows: AiringRow[];
}
