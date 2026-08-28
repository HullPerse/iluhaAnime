import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type {
  CollectionItem,
  CollectionStatus,
  CustomFieldDef,
} from "@/types/collection";
import { StatusOptions } from "../detail.collection";
import { WizardMoreFields } from "./more.wizard";

export function WizardDetailsPanel(props: {
  title: string;
  setTitle: (value: string) => void;
  altTitles: string;
  setAltTitles: (value: string) => void;
  type: CollectionItem["type"];
  setType: (value: CollectionItem["type"]) => void;
  status: CollectionStatus;
  setStatus: (value: CollectionStatus) => void;
  progressValue: string;
  setProgressValue: (value: string) => void;
  progressTotal: string;
  setProgressTotal: (value: string) => void;
  progressUnit: CollectionItem["progressUnit"];
  setProgressUnit: (value: CollectionItem["progressUnit"]) => void;
  rating: string;
  setRating: (value: string) => void;
  priority: CollectionItem["priority"];
  setPriority: (value: CollectionItem["priority"]) => void;
  isFavorite: boolean;
  setIsFavorite: (value: boolean) => void;
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
  onCustomFieldsChange: React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
}) {
  const { t } = useI18n();
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="mb-2 flex flex-col gap-1">
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="font-bold">
          {t("collection.wizard.title")} <span className="text-destructive">*</span>
        </span>
        <input
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          className="windows95-border bg-white px-2 py-1"
        />
      </label>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.status")}
          <select
            value={props.status}
            onChange={(e) => props.setStatus(e.target.value as CollectionStatus)}
            className="windows95-border bg-white px-1 py-0.5"
          >
            <StatusOptions />
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.type")}
          <select
            value={props.type}
            onChange={(e) => props.setType(e.target.value as CollectionItem["type"])}
            className="windows95-border bg-white px-1 py-0.5"
          >
            <option value="anime">{t("collection.type.anime")}</option>
            <option value="movie">{t("collection.type.movie")}</option>
            <option value="series">{t("collection.type.series")}</option>
            <option value="custom">{t("collection.type.custom")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.progress")}
          <input
            type="number"
            min="0"
            value={props.progressValue}
            onChange={(e) => props.setProgressValue(e.target.value)}
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          {t("collection.wizard.total")}
          <input
            type="number"
            min="0"
            value={props.progressTotal}
            onChange={(e) => props.setProgressTotal(e.target.value)}
            placeholder="-"
            className="windows95-border bg-white px-1 py-0.5"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          {t("collection.wizard.rating")}
          <input
            type="number"
            min="0"
            max="10"
            value={props.rating}
            onChange={(e) => props.setRating(e.target.value)}
            className="windows95-border w-12 bg-white px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-1">
          {t("collection.wizard.unit")}
          <select
            value={props.progressUnit}
            onChange={(e) =>
              props.setProgressUnit(e.target.value as CollectionItem["progressUnit"])
            }
            className="windows95-border bg-white px-1 py-0.5"
          >
            <option value="episodes">episodes</option>
            <option value="seasons">seasons</option>
            <option value="minutes">minutes</option>
            <option value="pages">pages</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          {t("collection.wizard.priority")}
          <select
            value={props.priority}
            onChange={(e) =>
              props.setPriority(e.target.value as CollectionItem["priority"])
            }
            className="windows95-border bg-white px-1 py-0.5"
          >
            <option value="low">{t("collection.priority.low")}</option>
            <option value="normal">{t("collection.priority.normal")}</option>
            <option value="high">{t("collection.priority.high")}</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={props.isFavorite}
            onChange={(e) => props.setIsFavorite(e.target.checked)}
          />{" "}
          {t("collection.wizard.favorite")}
        </label>
        <Button
          size="icon"
          className="ml-auto size-5"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          aria-label={t("collection.wizard.more")}
        >
          {showMore ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>
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