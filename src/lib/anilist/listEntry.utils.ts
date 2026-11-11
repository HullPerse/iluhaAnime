import type { QueryClient } from "@tanstack/react-query";

import { isValidFuzzyDateInput } from "@/lib/anilist/entries.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type {
  AniListEntry,
  AniMedia,
  AniSavedEntry,
  AnilistRouteData,
} from "@/types/anilist/anilist";
import type { ListEntryDraft } from "@/types/anilist/listEntry";
import type { TranslationKey } from "@/types/core/i18n";

export const scoreErrorKey = (error: TranslationKey | null): TranslationKey => {
  return error ?? "anilist.controls.score.invalid";
};

const parseRepeatInput = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(999, Math.max(0, parsed));
};

const dateArg = (input: string, previous: string | null | undefined): string | undefined => {
  if (input.trim() !== "") return input.trim();
  if (previous) return "";
  return undefined;
};

const parseProgressInput = (value: string, max: number): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(max, Math.max(0, parsed));
};

export const patchListEntry = (
  queryClient: QueryClient,
  mediaId: number,
  patch: ListEntryDraft
): void => {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) => {
    if (!old) return old;
    return {
      ...old,
      lists: old.lists.map((list) => ({
        ...list,
        entries: list.entries.map((entry) =>
          entry.media.id === mediaId ? { ...entry, ...clean } : entry
        ),
      })),
    };
  });
};

export const readListStatus = (queryClient: QueryClient, mediaId: number): string | null => {
  const data = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
  if (!data) return null;
  for (const list of data.lists) {
    const found = list.entries.find((entry) => entry.media.id === mediaId);
    if (found) return found.list_status;
  }
  return null;
};

const LIST_NAME_BY_STATUS: Record<string, string> = {
  COMPLETED: "Completed",
  CURRENT: "Watching",
  DROPPED: "Dropped",
  PAUSED: "Paused",
  PLANNING: "Planning",
  REPEATING: "Repeating",
};

/** Adds a brand-new entry to the cache immediately, before the server answers. */
export const insertListEntry = (
  queryClient: QueryClient,
  media: AniMedia,
  draft: ListEntryDraft
): void => {
  const now = Math.floor(Date.now() / 1000);
  const entry: AniListEntry = {
    media,
    progress: draft.progress,
    score: draft.score,
    list_status: draft.list_status,
    created_at: now,
    completed_at: draft.completed_at ?? null,
    started_at: draft.started_at ?? null,
    updated_at: now,
    notes: draft.notes,
    repeat: draft.repeat ?? null,
    private: draft.private ?? null,
    hidden_from_status_lists: draft.hidden_from_status_lists ?? null,
    custom_lists: draft.custom_lists,
  };
  queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) => {
    if (!old) return old;
    if (old.lists.some((list) => list.entries.some((item) => item.media.id === media.id))) {
      return old;
    }
    const target =
      old.lists.find((list) => list.name === LIST_NAME_BY_STATUS[draft.list_status]) ??
      old.lists.find((list) =>
        list.entries.some((item) => item.list_status === draft.list_status)
      );
    if (!target) {
      const name = LIST_NAME_BY_STATUS[draft.list_status] ?? draft.list_status;
      return { ...old, lists: [...old.lists, { name, entries: [entry] }] };
    }
    return {
      ...old,
      lists: old.lists.map((list) =>
        list === target ? { ...list, entries: [entry, ...list.entries] } : list
      ),
    };
  });
};

export const reconcileSavedEntry = (
  queryClient: QueryClient,
  mediaId: number,
  previousStatus: string | null,
  draft: ListEntryDraft,
  saved: AniSavedEntry | null
): { status: string; bucketChanged: boolean } => {
  const status = saved?.status ?? draft.list_status;
  const customLists = saved?.customLists ?? [];
  const patch: ListEntryDraft = {
    list_status: status,
    progress: saved?.progress ?? draft.progress,
    score: draft.score,
    notes: draft.notes,
    custom_lists: customLists.length > 0 ? customLists : draft.custom_lists,
  };
  if (draft.repeat !== undefined) patch.repeat = saved?.repeat ?? draft.repeat;
  if (draft.private !== undefined) patch.private = draft.private;
  if (draft.hidden_from_status_lists !== undefined)
    patch.hidden_from_status_lists = draft.hidden_from_status_lists;
  if (draft.started_at !== undefined) patch.started_at = draft.started_at;
  if (draft.completed_at !== undefined) patch.completed_at = draft.completed_at;
  patchListEntry(queryClient, mediaId, patch);
  return { status, bucketChanged: previousStatus === null || previousStatus !== status };
};

export const removeListEntry = (queryClient: QueryClient, mediaId: number): void => {
  queryClient.setQueryData<AnilistRouteData>(queryKeys.anilistData(), (old) => {
    if (!old) return old;
    return {
      ...old,
      lists: old.lists.map((list) => ({
        ...list,
        entries: list.entries.filter((entry) => entry.media.id !== mediaId),
      })),
    };
  });
};

export const textOrEmpty = (value: string | null | undefined): string => {
  return value ?? "";
};

export const numText = (value: number | null | undefined): string => {
  return value?.toString() ?? "";
};

export const flagOrFalse = (value: boolean | null | undefined): boolean => {
  return value ?? false;
};

export const datesInvalid = (started: string, completed: string): boolean => {
  const badStarted = started.trim() !== "" && !isValidFuzzyDateInput(started);
  const badCompleted = completed.trim() !== "" && !isValidFuzzyDateInput(completed);
  return badStarted || badCompleted;
};

export const buildSaveValues = (params: {
  status: string;
  progressInput: string;
  maxEpisodes: number;
  score: number | null;
  notesInput: string;
  repeatInput: string;
  isPrivate: boolean;
  hidden: boolean;
  flagsTouched: boolean;
  startedInput: string;
  completedInput: string;
  customLists: string[];
  listEntry: ListEntryDraft | undefined;
}): ListEntryDraft => {
  const flagsKnown =
    params.listEntry?.private !== undefined ||
    params.listEntry?.hidden_from_status_lists !== undefined;
  const trimmed = params.notesInput.trim();
  return {
    list_status: params.status,
    progress: parseProgressInput(params.progressInput, params.maxEpisodes),
    score: params.score,
    notes: trimmed ? trimmed : null,
    repeat: params.repeatInput.trim() === "" ? undefined : parseRepeatInput(params.repeatInput),
    private: params.flagsTouched || flagsKnown ? params.isPrivate : undefined,
    hidden_from_status_lists: params.flagsTouched || flagsKnown ? params.hidden : undefined,
    started_at: dateArg(params.startedInput, params.listEntry?.started_at),
    completed_at: dateArg(params.completedInput, params.listEntry?.completed_at),
    custom_lists: params.customLists,
  };
};
