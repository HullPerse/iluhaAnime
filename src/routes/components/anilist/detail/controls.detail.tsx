import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { listStatusOptions } from "@/config/labels.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { isValidFuzzyDateInput } from "@/lib/entries.utils";
import {
  numericInputStep,
  parseScoreFormat,
  scoreFormatSuffix,
  scoreOptions,
  usesNumericInput,
  validateScoreInput,
} from "@/lib/anilistScore.utils";
import type { AnilistScoreFormat } from "@/types/anilistScore";
import { buildAnilistPrefill } from "@/lib/import.utils";
import { queryKeys } from "@/lib/keys.utils";
import { attempt } from "@/lib/attempt.utils";
import { markOwnAnilistListStatus } from "@/store/anilist.store";
import { requestWizardPrefill } from "@/store/collection.store";
import type { AniMedia, AniSavedEntry, AnilistRouteData } from "@/types/anilist";
import type { TranslationKey } from "@/types/i18n";

function scoreErrorKey(error: TranslationKey | null): TranslationKey {
  return error ?? "anilist.controls.score.invalid";
}

interface ListEntryPatch {
  list_status: string;
  progress: number | null;
  score: number | null;
  notes: string | null;
  repeat?: number | null;
  private?: boolean | null;
  hidden_from_status_lists?: boolean | null;
  started_at?: string | null;
  completed_at?: string | null;
  custom_lists: string[];
}

function parseRepeatInput(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(999, Math.max(0, parsed));
}

function dateArg(input: string, previous: string | null | undefined): string | undefined {
  if (input.trim() !== "") return input.trim();
  if (previous) return "";
  return undefined;
}

function parseProgressInput(value: string, max: number): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(max, Math.max(0, parsed));
}

function patchListEntry(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number,
  patch: ListEntryPatch
): void {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  queryClient.setQueryData(queryKeys.anilistData(), (old: unknown) => {
    if (!old) return old;
    const data = old as AnilistRouteData;
    return {
      ...data,
      lists: data.lists.map((list) => ({
        ...list,
        entries: list.entries.map((entry) =>
          entry.media.id === mediaId ? { ...entry, ...clean } : entry
        ),
      })),
    };
  });
}

function readListStatus(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number
): string | null {
  const data = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
  if (!data) return null;
  for (const list of data.lists) {
    const found = list.entries.find((entry) => entry.media.id === mediaId);
    if (found) return found.list_status;
  }
  return null;
}

function reconcileSavedEntry(
  queryClient: ReturnType<typeof useQueryClient>,
  mediaId: number,
  previousStatus: string | null,
  draft: ListEntryPatch,
  saved: AniSavedEntry | null
): { status: string; bucketChanged: boolean } {
  const status = saved?.status ?? draft.list_status;
  const customLists = saved?.customLists ?? [];
  const patch: ListEntryPatch = {
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
  if (previousStatus !== null) {
    patchListEntry(queryClient, mediaId, patch);
  }
  return { status, bucketChanged: previousStatus === null || previousStatus !== status };
}

function DeleteListEntryButton({
  animeId,
  disabled,
  onSaved,
  onClose,
  onError,
}: {
  animeId: number;
  disabled: boolean;
  onSaved?: () => void;
  onClose?: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    const userId = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData())?.user?.id;
    if (!userId) {
      onError(t("anilist.controls.delete.error"));
      return;
    }
    setDeleting(true);
    const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
    removeListEntry(queryClient, animeId);
    const [, error] = await attempt(anilistApi.deleteEntry(animeId, userId));
    if (error) {
      queryClient.setQueryData(queryKeys.anilistData(), previous);
      onError(t("anilist.controls.delete.error"));
      setDeleting(false);
      return;
    }
    onSaved?.();
    onClose?.();
  };

  return (
    <Button variant="error" onClick={handleDelete} disabled={disabled || deleting}>
      {t("anilist.controls.delete")}
    </Button>
  );
}
function removeListEntry(queryClient: ReturnType<typeof useQueryClient>, mediaId: number): void {
  queryClient.setQueryData(queryKeys.anilistData(), (old: unknown) => {
    if (!old) return old;
    const data = old as AnilistRouteData;
    return {
      ...data,
      lists: data.lists.map((list) => ({
        ...list,
        entries: list.entries.filter((entry) => entry.media.id !== mediaId),
      })),
    };
  });
}

interface ListEntryDraft {
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

function textOrEmpty(value: string | null | undefined): string {
  return value ?? "";
}

function numText(value: number | null | undefined): string {
  return value?.toString() ?? "";
}

function flagOrFalse(value: boolean | null | undefined): boolean {
  return value ?? false;
}

function useListDraft(animeId: number, listEntry: ListEntryDraft | undefined) {
  const [editStatus, setEditStatus] = useState(listEntry?.list_status ?? "PLANNING");
  const [editProgress, setEditProgress] = useState(numText(listEntry?.progress));
  const [editScore, setEditScore] = useState(numText(listEntry?.score));
  const [editNotes, setEditNotes] = useState(textOrEmpty(listEntry?.notes));
  const [editRepeat, setEditRepeat] = useState(numText(listEntry?.repeat));
  const [editPrivate, setEditPrivate] = useState(flagOrFalse(listEntry?.private));
  const [editHidden, setEditHidden] = useState(flagOrFalse(listEntry?.hidden_from_status_lists));
  const [editStarted, setEditStarted] = useState(textOrEmpty(listEntry?.started_at));
  const [editCompleted, setEditCompleted] = useState(textOrEmpty(listEntry?.completed_at));
  const [editCustomLists, setEditCustomLists] = useState<string[]>(listEntry?.custom_lists ?? []);
  const [flagsTouched, setFlagsTouched] = useState(false);

  const syncedAnimeId = useRef(animeId);
  useEffect(() => {
    if (syncedAnimeId.current === animeId) return;
    syncedAnimeId.current = animeId;
    setEditStatus(listEntry?.list_status ?? "PLANNING");
    setEditProgress(numText(listEntry?.progress));
    setEditScore(numText(listEntry?.score));
    setEditNotes(textOrEmpty(listEntry?.notes));
    setEditRepeat(numText(listEntry?.repeat));
    setEditPrivate(flagOrFalse(listEntry?.private));
    setEditHidden(flagOrFalse(listEntry?.hidden_from_status_lists));
    setEditStarted(textOrEmpty(listEntry?.started_at));
    setEditCompleted(textOrEmpty(listEntry?.completed_at));
    setEditCustomLists(listEntry?.custom_lists ?? []);
    setFlagsTouched(false);
  }, [animeId, listEntry]);

  return {
    editStatus,
    setEditStatus,
    editProgress,
    setEditProgress,
    editScore,
    setEditScore,
    editNotes,
    setEditNotes,
    editRepeat,
    setEditRepeat,
    editPrivate,
    setEditPrivate,
    editHidden,
    setEditHidden,
    editStarted,
    setEditStarted,
    editCompleted,
    setEditCompleted,
    editCustomLists,
    setEditCustomLists,
    flagsTouched,
    setFlagsTouched,
  };
}

function datesInvalid(started: string, completed: string): boolean {
  const badStarted = started.trim() !== "" && !isValidFuzzyDateInput(started);
  const badCompleted = completed.trim() !== "" && !isValidFuzzyDateInput(completed);
  return badStarted || badCompleted;
}

function buildSaveValues(params: {
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
}): ListEntryPatch {
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
}

function AniListActionControls({
  anime,
  listEntry,
  scoreFormat,
  isLoggedIn,
  onSaved,
  onClose,
}: {
  anime: AniMedia;
  listEntry?: ListEntryDraft;
  scoreFormat?: AnilistScoreFormat | null;
  isLoggedIn: boolean;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const format = parseScoreFormat(scoreFormat);
  const {
    editStatus,
    setEditStatus,
    editProgress,
    editScore,
    editNotes,
    setEditNotes,
    editRepeat,
    setEditRepeat,
    editPrivate,
    setEditPrivate,
    editHidden,
    setEditHidden,
    editStarted,
    setEditStarted,
    editCompleted,
    setEditCompleted,
    editCustomLists,
    setEditCustomLists,
    setEditProgress,
    setEditScore,
    flagsTouched,
    setFlagsTouched,
  } = useListDraft(anime.id, listEntry);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { data: customLists } = useAppQuery("slow", {
    queryKey: queryKeys.customLists(),
    queryFn: () => anilistApi.getCustomLists(),
    enabled: isLoggedIn,
    retry: false,
  });

  const scoreCheck = validateScoreInput(editScore, format);
  const scoreInvalid = scoreCheck.error !== null;
  const scoreErrorMessage = t(scoreErrorKey(scoreCheck.error));
  const maxEpisodes = anime.episodes ?? 9999;

  const handleSave = async () => {
    if (scoreInvalid) {
      setSaveError(scoreErrorMessage);
      return;
    }
    if (datesInvalid(editStarted, editCompleted)) {
      setSaveError(t("anilist.controls.date.invalid"));
      return;
    }
    const values = buildSaveValues({
      status: editStatus,
      progressInput: editProgress,
      maxEpisodes,
      score: scoreCheck.value,
      notesInput: editNotes,
      repeatInput: editRepeat,
      isPrivate: editPrivate,
      hidden: editHidden,
      flagsTouched,
      startedInput: editStarted,
      completedInput: editCompleted,
      customLists: editCustomLists,
      listEntry,
    });
    setSaving(true);
    setSaveError("");
    const previousStatus = readListStatus(queryClient, anime.id);
    const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
    if (previousStatus !== null) patchListEntry(queryClient, anime.id, values);
    const startedAt = performance.now();
    const [saved, error] = await attempt(
      anilistApi.saveEntry({
        mediaId: anime.id,
        status: values.list_status,
        progress: values.progress,
        score: values.score,
        notes: values.notes,
        repeat: values.repeat,
        private: values.private,
        hiddenFromStatusLists: values.hidden_from_status_lists,
        startedAt: values.started_at,
        completedAt: values.completed_at,
        customLists: (customLists ?? []).length > 0 ? values.custom_lists : undefined,
      })
    );
    if (error) {
      if (previousStatus !== null) queryClient.setQueryData(queryKeys.anilistData(), previous);
      const message = error instanceof Error ? error.message : String(error);
      const reason = message.length > 300 ? `${message.slice(0, 300)}...` : message;
      console.warn("anilist.save.failed", {
        elapsedMs: Math.round(performance.now() - startedAt),
        mediaId: anime.id,
        progress: values.progress,
        status: values.list_status,
        error: reason,
      });
      setSaveError(t("anilist.controls.save.error.detail", { error: reason }));
      setSaving(false);
      return;
    }
    const reconciled = reconcileSavedEntry(queryClient, anime.id, previousStatus, values, saved);
    markOwnAnilistListStatus(anime.id, reconciled.status);
    if (reconciled.bucketChanged) onSaved?.();
    onClose?.();
  };

  return (
    <div className="windows95-border">
      <div className="bg-secondary windows95-font text-title-text flex flex-row px-1 py-0.5 text-xs font-bold">
        {listEntry ? t("anilist.controls.edit.list") : t("anilist.controls.add.to.list")}
      </div>
      <div className="flex flex-col gap-2 p-1.5">
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.status")}</span>
          <Select
            className="flex-1"
            value={editStatus}
            onChange={(v) => setEditStatus(v)}
            options={listStatusOptions.map((o) => ({
              ...o,
              label: t(o.label),
            }))}
          />
        </div>
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.progress")}</span>
          <Input
            type="number"
            min={0}
            max={anime.episodes ?? 9999}
            value={editProgress}
            onChange={(e) => setEditProgress(e.target.value)}
            aria-label={t("anilist.controls.progress")}
            className="h-7 w-20 text-xs"
          />
          {anime.episodes && (
            <span className="windows95-text text-xs">
              / {anime.episodes} {t("anilist.details.eps.short")}
            </span>
          )}
        </div>
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.repeat")}</span>
          <Input
            type="number"
            min={0}
            max={999}
            value={editRepeat}
            onChange={(e) => setEditRepeat(e.target.value)}
            aria-label={t("anilist.controls.repeat")}
            className="h-7 w-20 text-xs"
          />
        </div>
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.score")}</span>
          {usesNumericInput(format) ? (
            <Input
              type="number"
              min={0}
              max={format === "POINT_100" ? 100 : 10}
              step={numericInputStep(format)}
              value={editScore}
              onChange={(e) => setEditScore(e.target.value)}
              aria-label={t("anilist.controls.score")}
              className="h-7 w-20 text-xs"
            />
          ) : (
            <Select
              value={editScore}
              onChange={(v) => setEditScore(v)}
              options={scoreOptions(format)}
            />
          )}
          <span className="windows95-text text-xs">{scoreFormatSuffix(format)}</span>
        </div>
        {scoreInvalid && (
          <span className="text-destructive text-xs font-bold">{scoreErrorMessage}</span>
        )}
        <div className="windows95-text flex flex-row items-start gap-2">
          <span className="w-20 shrink-0 pt-1">{t("anilist.controls.notes")}</span>
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            aria-label={t("anilist.controls.notes")}
            rows={3}
            className="windows95-border bg-field text-text min-w-0 flex-1 px-1 py-0.5 text-xs outline-0"
          />
        </div>
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.started")}</span>
          <Input
            type="text"
            value={editStarted}
            placeholder="YYYY-MM-DD"
            onChange={(e) => setEditStarted(e.target.value)}
            aria-label={t("anilist.controls.started")}
            className="h-7 w-28 text-xs"
          />
          <span className="w-20 shrink-0">{t("anilist.controls.completed")}</span>
          <Input
            type="text"
            value={editCompleted}
            placeholder="YYYY-MM-DD"
            onChange={(e) => setEditCompleted(e.target.value)}
            aria-label={t("anilist.controls.completed")}
            className="h-7 w-28 text-xs"
          />
        </div>
        <div className="windows95-text flex flex-row items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1 text-xs select-none">
            <Checkbox
              checked={editPrivate}
              onChange={(checked) => {
                setEditPrivate(checked);
                setFlagsTouched(true);
              }}
              aria-label={t("anilist.controls.private")}
            />
            <span>{t("anilist.controls.private")}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-xs select-none">
            <Checkbox
              checked={editHidden}
              onChange={(checked) => {
                setEditHidden(checked);
                setFlagsTouched(true);
              }}
              aria-label={t("anilist.controls.hidden")}
            />
            <span>{t("anilist.controls.hidden")}</span>
          </label>
        </div>
        {(customLists ?? []).length > 0 && (
          <div className="windows95-text flex flex-row items-start gap-2">
            <span className="w-20 shrink-0 pt-1">{t("anilist.controls.custom.lists")}</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
              {(customLists ?? []).map((name) => (
                <label
                  key={name}
                  className="flex cursor-pointer items-center gap-1 text-xs select-none"
                >
                  <Checkbox
                    checked={editCustomLists.includes(name)}
                    onChange={(checked) =>
                      setEditCustomLists((prev) =>
                        checked ? [...prev, name] : prev.filter((item) => item !== name)
                      )
                    }
                    aria-label={name}
                  />
                  <span className="truncate" title={name}>
                    {name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {saveError && !scoreInvalid && (
          <span className="text-destructive text-xs font-bold">{saveError}</span>
        )}
        <div className="mt-0.5 flex flex-row justify-end gap-2">
          {listEntry !== undefined && (
            <DeleteListEntryButton
              animeId={anime.id}
              disabled={saving}
              onSaved={onSaved}
              onClose={onClose}
              onError={setSaveError}
            />
          )}
          <Button
            variant="outline"
            onClick={() =>
              requestWizardPrefill(
                buildAnilistPrefill(anime, listEntry?.list_status ?? null, listEntry?.score, format)
              )
            }
          >
            {t("collection.add.media")}
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {t("anilist.controls.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AniListActionControls;
