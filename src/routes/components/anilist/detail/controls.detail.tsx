import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { listStatusOptions } from "@/config/anilist/labels.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import {
  numericInputStep,
  parseScoreFormat,
  scoreFormatSuffix,
  scoreOptions,
  usesNumericInput,
  validateScoreInput,
  type AnilistScoreFormat,
} from "@/lib/anilist/score.utils";
import { buildAnilistPrefill } from "@/lib/collection/import.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { markOwnAnilistListStatus } from "@/store/anilist.store";
import { requestWizardPrefill } from "@/store/collection.store";
import type { AniMedia, AnilistRouteData } from "@/types/anilist";
import type { TranslationKey } from "@/types/i18n";

function scoreErrorKey(error: TranslationKey | null): TranslationKey {
  return error ?? "anilist.controls.score.invalid";
}

interface ListEntryPatch {
  list_status: string;
  progress: number | null;
  score: number | null;
  notes: string | null;
  custom_lists: string[];
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
  queryClient.setQueryData(["anilist_data"], (old: unknown) => {
    if (!old) return old;
    const data = old as AnilistRouteData;
    return {
      ...data,
      lists: data.lists.map((list) => ({
        ...list,
        entries: list.entries.map((entry) =>
          entry.media.id === mediaId ? { ...entry, ...patch } : entry
        ),
      })),
    };
  });
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
    const userId = queryClient.getQueryData<AnilistRouteData>(["anilist_data"])?.user?.id;
    if (!userId) {
      onError(t("anilist.controls.delete.error"));
      return;
    }
    setDeleting(true);
    const previous = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
    removeListEntry(queryClient, animeId);
    const [, error] = await attempt(anilistApi.deleteEntry(animeId, userId));
    if (error) {
      queryClient.setQueryData(["anilist_data"], previous);
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
  queryClient.setQueryData(["anilist_data"], (old: unknown) => {
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
  custom_lists: string[];
}

function useListDraft(animeId: number, listEntry: ListEntryDraft | undefined) {
  const [editStatus, setEditStatus] = useState(listEntry?.list_status ?? "PLANNING");
  const [editProgress, setEditProgress] = useState(listEntry?.progress?.toString() ?? "");
  const [editScore, setEditScore] = useState(listEntry?.score?.toString() ?? "");
  const [editNotes, setEditNotes] = useState(listEntry?.notes ?? "");
  const [editCustomLists, setEditCustomLists] = useState<string[]>(listEntry?.custom_lists ?? []);

  const syncedAnimeId = useRef(animeId);
  useEffect(() => {
    if (syncedAnimeId.current === animeId) return;
    syncedAnimeId.current = animeId;
    setEditStatus(listEntry?.list_status ?? "PLANNING");
    setEditProgress(listEntry?.progress?.toString() ?? "");
    setEditScore(listEntry?.score?.toString() ?? "");
    setEditNotes(listEntry?.notes ?? "");
    setEditCustomLists(listEntry?.custom_lists ?? []);
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
    editCustomLists,
    setEditCustomLists,
  };
}

function AniListActionControls({
  anime,
  listEntry,
  scoreFormat,
  onSaved,
  onClose,
}: {
  anime: AniMedia;
  listEntry?: ListEntryDraft;
  scoreFormat?: AnilistScoreFormat | null;
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
    editCustomLists,
    setEditCustomLists,
    setEditProgress,
    setEditScore,
  } = useListDraft(anime.id, listEntry);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { data: customLists } = useAppQuery("slow", {
    queryKey: queryKeys.customLists(),
    queryFn: () => anilistApi.getCustomLists(),
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
    const progress = parseProgressInput(editProgress, maxEpisodes);
    setSaving(true);
    setSaveError("");
    const trimmed = editNotes.trim();
    const values = {
      list_status: editStatus,
      progress,
      score: scoreCheck.value,
      notes: trimmed ? trimmed : null,
      custom_lists: editCustomLists,
    };
    const hadEntry = listEntry !== undefined;
    const previous = queryClient.getQueryData<AnilistRouteData>(["anilist_data"]);
    if (hadEntry) patchListEntry(queryClient, anime.id, values);
    const [, error] = await attempt(
      anilistApi.saveEntry({
        mediaId: anime.id,
        status: values.list_status,
        progress: values.progress,
        score: values.score,
        notes: values.notes,
        customLists: (customLists ?? []).length > 0 ? values.custom_lists : undefined,
      })
    );
    if (error) {
      if (hadEntry) queryClient.setQueryData(["anilist_data"], previous);
      setSaveError(t("anilist.controls.save.error"));
      setSaving(false);
      return;
    }
    markOwnAnilistListStatus(anime.id, values.list_status);
    onSaved?.();
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
            className="h-7 w-20 text-xs"
          />
          {anime.episodes && (
            <span className="windows95-text text-xs">
              / {anime.episodes} {t("anilist.details.eps.short")}
            </span>
          )}
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
                buildAnilistPrefill(
                  anime,
                  listEntry?.list_status ?? null,
                  listEntry?.score,
                  format
                )
              )
            }
          >
            {t("collection.add.media")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("anilist.controls.saving") : t("anilist.controls.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AniListActionControls;
