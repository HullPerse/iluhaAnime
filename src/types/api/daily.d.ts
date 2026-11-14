export type DailyMode = "frames" | "op" | "audio";
export type DailyGameState = "pending" | "ready" | "failed";

export interface DailyAnswer {
  mediaId: number;
  title: string;
  year: number | null;
  format: string | null;
  episodes: number | null;
  genres: string[];
  studio: string | null;
  score: number | null;
  source: string | null;
}

export interface DailyResultView {
  won: boolean;
  attempts: number;
  answer: DailyAnswer;
  rewardPackId: string | null;
}

export interface DailyModeView {
  mode: DailyMode;
  state: DailyGameState;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  result: DailyResultView | null;
}

export interface DailyClipProgress {
  day: string;
  mode: DailyMode;
  received: number;
  total: number;
}

export interface DailyBootstrap {
  day: string;
  modes: DailyModeView[];
  streak: number;
}

export interface DailyFrameView {
  slot: number;
  dataUrl: string;
  hintKind: string;
  hintValue: string;
}

export interface DailyFramesView {
  day: string;
  mode: DailyMode;
  attempts: number;
  maxAttempts: number;
  revealed: number;
  frames: DailyFrameView[];
  result: DailyResultView | null;
}

export interface DailyHintView {
  slot: number;
  hintKind: string;
  hintValue: string;
}

export interface DailyOpView {
  day: string;
  mode: DailyMode;
  attempts: number;
  maxAttempts: number;
  revealed: number;
  clipPath: string;
  fullPath: string;
  startFraction: number;
  themeType: string;
  themeTitle: string;
  hints: DailyHintView[];
  result: DailyResultView | null;
}

export interface DailyOpGuessView {
  correct: boolean;
  sameFranchise: boolean;
  finished: boolean;
  state: DailyOpView;
}

export interface DailyHistoryItem {
  day: string;
  mode: DailyMode;
  won: boolean;
  attempts: number;
  maxAttempts: number;
  mediaId: number | null;
  title: string;
  playedAt: number;
}

export interface DailyGuessView {
  correct: boolean;
  sameFranchise: boolean;
  attempts: number;
  maxAttempts: number;
  revealed: number;
  finished: boolean;
  frame: DailyFrameView | null;
  result: DailyResultView | null;
}
