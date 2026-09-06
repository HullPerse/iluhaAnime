import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  CustomFieldDef,
} from "@/types/collection";

import { WizardMoreFields } from "./more.wizard";

export function WizardDetailsPanel(props: {
  title: string;
  setTitle: (value: string) => void;
  duplicateTitle: boolean;
  type: CollectionItem["type"];
  setType: (value: CollectionItem["type"]) => void;
  status: CollectionStatus;
  setStatus: (value: CollectionStatus) => void;
  statuses: CollectionStatusDef[];
  progressValue: string;
  setProgressValue: (value: string) => void;
  progressTotal: string;
  setProgressTotal: (value: string) => void;
  progressUnit: CollectionItem["progressUnit"];
  setProgressUnit: (value: CollectionItem["progressUnit"]) => void;
  rating: string;
  setRating: (value: string) => void;
  isFavorite: boolean;
  setIsFavorite: (value: boolean) => void;
  altTitles: string;
  setAltTitles: (value: string) => void;
  year: string;
  setYear: (value: string) => void;
  durationMinutes: string;
  setDurationMinutes: (value: string) => void;
  studio: string;
  setStudio: (value: string) => void;
  genres: string;
  setGenres: (value: string) => void;
  startedAt: string;
  setStartedAt: (value: string) => void;
  finishedAt: string;
  setFinishedAt: (value: string) => void;
  externalIds: CollectionItem["externalIds"];
  description: string;
  setDescription: (value: string) => void;
  customFieldDefs: CustomFieldDef[];
  customFields: Record<string, unknown>;
  onCustomFieldsChange: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const { t } = useI18n();
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">
        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.title")} <span className="text-destructive">*</span>
        </span>
        <input
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          className="windows95-border bg-white px-2 py-1 text-xs"
          aria-label={t("collection.wizard.title")}
        />
        {props.duplicateTitle && (
          <>
            <span />
            <span className="text-destructive text-xs">
              {t("collection.wizard.duplicate.title")}
            </span>
          </>
        )}

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.status")}
        </span>
        <select
          value={props.status}
          onChange={(e) => props.setStatus(e.target.value as CollectionStatus)}
          className="windows95-border bg-white px-1 py-0.5 text-xs"
        >
          {props.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {statusLabel(props.statuses, s.id, t)}
            </option>
          ))}
        </select>

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.type")}
        </span>
        <select
          value={props.type}
          onChange={(e) => props.setType(e.target.value as CollectionItem["type"])}
          className="windows95-border bg-white px-1 py-0.5 text-xs"
        >
          <option value="anime">{t("collection.type.anime")}</option>
          <option value="movie">{t("collection.type.movie")}</option>
          <option value="series">{t("collection.type.series")}</option>
          <option value="custom">{t("collection.type.custom")}</option>
        </select>

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.progress")}
        </span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            value={props.progressValue}
            onChange={(e) => props.setProgressValue(e.target.value)}
            className="windows95-border w-16 bg-white px-1 py-0.5 text-xs"
          />
          <span className="text-hint text-xs">/</span>
          <input
            type="number"
            min="0"
            value={props.progressTotal}
            onChange={(e) => props.setProgressTotal(e.target.value)}
            placeholder="-"
            className="windows95-border w-16 bg-white px-1 py-0.5 text-xs"
          />
          <select
            value={props.progressUnit}
            onChange={(e) =>
              props.setProgressUnit(e.target.value as CollectionItem["progressUnit"])
            }
            className="windows95-border bg-white px-1 py-0.5 text-xs"
          >
            <option value="episodes">ep</option>
            <option value="seasons">seasons</option>
            <option value="minutes">min</option>
            <option value="pages">pages</option>
          </select>
        </div>

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.rating")}
        </span>
        <input
          type="number"
          min="0"
          max="10"
          value={props.rating}
          onChange={(e) => props.setRating(e.target.value)}
          className="windows95-border w-16 bg-white px-1 py-0.5 text-xs"
        />

        <span className="text-text flex items-center text-xs font-bold">
          {t("collection.wizard.favorite")}
        </span>
        <label className="text-text flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={props.isFavorite}
            onChange={(e) => props.setIsFavorite(e.target.checked)}
          />
          <span className="text-xs">{t("collection.wizard.favorite")}</span>
        </label>
      </div>

      <Button
        size="default"
        variant="ghost"
        className="w-fit text-xs"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        aria-label={t("collection.wizard.more")}
      >
        {showMore ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        <span className="ml-0.5">{t("collection.wizard.more")}</span>
      </Button>

      {showMore && (
        <WizardMoreFields
          altTitles={props.altTitles}
          setAltTitles={props.setAltTitles}
          year={props.year}
          setYear={props.setYear}
          durationMinutes={props.durationMinutes}
          setDurationMinutes={props.setDurationMinutes}
          studio={props.studio}
          setStudio={props.setStudio}
          genres={props.genres}
          setGenres={props.setGenres}
          startedAt={props.startedAt}
          setStartedAt={props.setStartedAt}
          finishedAt={props.finishedAt}
          setFinishedAt={props.setFinishedAt}
          externalIds={props.externalIds}
          description={props.description}
          setDescription={props.setDescription}
          customFieldDefs={props.customFieldDefs}
          customFields={props.customFields}
          onCustomFieldsChange={props.onCustomFieldsChange}
        />
      )}
    </div>
  );
}
