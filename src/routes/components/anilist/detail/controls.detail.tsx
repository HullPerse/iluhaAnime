import { useState, useEffect } from "react";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { listStatusOptions } from "@/config/anilist/labels.config";
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
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { useCollectionStore } from "@/store/collection.store";
import type { AniMedia } from "@/types/anilist";
import type { TranslationKey } from "@/types/i18n";

function scoreErrorKey(error: TranslationKey | null): TranslationKey {
  return error ?? "anilist.controls.score.invalid";
}

function AniListActionControls({
  anime,
  listEntry,
  scoreFormat,
  onSaved,
  onClose,
}: {
  anime: AniMedia;
  listEntry?: {
    progress: number | null;
    score: number | null;
    list_status: string;
    notes: string | null;
  };
  scoreFormat?: AnilistScoreFormat | null;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const format = parseScoreFormat(scoreFormat);
  const [editStatus, setEditStatus] = useState(listEntry?.list_status ?? "PLANNING");
  const [editProgress, setEditProgress] = useState(listEntry?.progress?.toString() ?? "");
  const [editScore, setEditScore] = useState(listEntry?.score?.toString() ?? "");
  const [editNotes, setEditNotes] = useState(listEntry?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (listEntry) {
      setEditStatus(listEntry.list_status ?? "PLANNING");
      setEditProgress(listEntry.progress?.toString() ?? "");
      setEditScore(listEntry.score?.toString() ?? "");
      setEditNotes(listEntry.notes ?? "");
    }
  }, [listEntry]);

  const scoreCheck = validateScoreInput(editScore, format);
  const scoreInvalid = scoreCheck.error !== null;
  const scoreErrorMessage = t(scoreErrorKey(scoreCheck.error));

  const handleSave = async () => {
    if (scoreInvalid) {
      setSaveError(scoreErrorMessage);
      return;
    }
    setSaving(true);
    setSaveError("");
    const trimmed = editNotes.trim();
    const [, error] = await attempt(
      anilistApi.saveEntry({
        mediaId: anime.id,
        status: editStatus,
        progress: editProgress ? Number.parseInt(editProgress, 10) : null,
        score: scoreCheck.value,
        notes: trimmed ? trimmed : null,
      })
    );
    if (error) {
      setSaveError(t("anilist.controls.save.error"));
      setSaving(false);
      return;
    }
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
        <div className="windows95-text flex flex-row items-center gap-2">
          <span className="w-20 shrink-0">{t("anilist.controls.notes")}</span>
          <Input
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            aria-label={t("anilist.controls.notes")}
            className="h-7 min-w-0 flex-1 text-xs"
          />
        </div>
        {saveError && !scoreInvalid && (
          <span className="text-destructive text-xs font-bold">{saveError}</span>
        )}
        <div className="mt-0.5 flex flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={() =>
              useCollectionStore
                .getState()
                .requestWizardPrefill(
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
