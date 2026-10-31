import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { listStatusOptions } from "@/config/system/labels.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useListDraft } from "@/hooks/anilist/listDraft.hook";
import {
  buildSaveValues,
  datesInvalid,
  patchListEntry,
  readListStatus,
  reconcileSavedEntry,
  scoreErrorKey,
} from "@/lib/anilist/listEntry.utils";
import { DeleteListEntryButton } from "@/routes/components/anilist/detail/controls/deleteListEntryButton.controls";
import {
  numericInputStep,
  parseScoreFormat,
  scoreFormatSuffix,
  scoreOptions,
  usesNumericInput,
  validateScoreInput,
} from "@/lib/anilist/anilistScore.utils";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import { buildAnilistPrefill } from "@/lib/core/import.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { markOwnAnilistListStatus } from "@/store/anilist.store";
import { requestWizardPrefill } from "@/store/collection.store";
import type { AniMedia, AnilistRouteData } from "@/types/anilist/anilist";
import type { ListEntryDraft } from "@/types/anilist/listEntry";

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
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string>("");
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
