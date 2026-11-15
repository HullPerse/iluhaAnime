export interface DailyGuessSuggestion {
  id: number;
  title: string;
  titles: string[];
  coverUrl: string | null;
  alias: string | null;
  year: number | null;
  format: string | null;
  popularity: number;
}

export interface GuessHistoryItem {
  media: Pick<DailyGuessSuggestion, "id" | "title" | "coverUrl">;
  correct: boolean;
  franchise: boolean;
}
