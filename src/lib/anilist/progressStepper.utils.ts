import { useQueryClient } from "@tanstack/react-query";

import type { AnilistRouteData } from "@/types/anilist/anilist";
import { queryKeys } from "@/lib/core/keys.utils";

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

export const STEPPER_SYNC_WAIT_MS = 600;
export const STEPPER_SYNC_MAX_WAIT_MS = 4000;
export const STEPPER_SAVED_MS = 1500;

export type StepperPhase = "idle" | "syncing" | "saved" | "error";

export function patchEntry(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number,
  patch: EntryPatch
): void {
  queryClient.setQueryData(queryKeys.anilistData(), (old: unknown) => {
    if (!old) return old;
    const data = old as AnilistRouteData;
    let touched = false;
    const lists = data.lists.map((list) => {
      const index = list.entries.findIndex((item) => item.media.id === mediaId);
      if (index === -1) return list;
      const previous = list.entries[index];
      if (!previous) return list;
      touched = true;
      const entries = list.entries.slice();
      entries[index] = { ...previous, ...patch };
      return { ...list, entries };
    });
    return touched ? { ...data, lists } : data;
  });
}

export function readLiveFields(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number,
  fallback: LiveEntryFields
): LiveEntryFields {
  const data = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
  if (data) {
    for (const list of data.lists) {
      const found = list.entries.find((item) => item.media.id === mediaId);
      if (found) return { status: found.list_status, score: found.score, notes: found.notes };
    }
  }
  return fallback;
}

export function clampProgress(value: number, max: number | null): number {
  if (max != null) return Math.min(max, Math.max(0, value));
  return Math.max(0, value);
}

export function resolveSaveStatus(target: number, max: number | null, current: string): string {
  if (max != null && max > 0 && target >= max) return "COMPLETED";
  return current;
}

export function shortReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}
