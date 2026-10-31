import type { ApiTransport } from "@/types/core/transport";

export interface AnilistApiConfig {
  transport?: ApiTransport;
  proxyUrl?: string | null | (() => string | null);
}

export interface SaveAnilistEntryInput {
  mediaId: number;
  status: string;
  progress: number | null;
  score: number | null;
  notes: string | null;
  customLists?: string[] | null;
  repeat?: number | null;
  private?: boolean | null;
  hiddenFromStatusLists?: boolean | null;
  startedAt?: string | null;
  completedAt?: string | null;
}
